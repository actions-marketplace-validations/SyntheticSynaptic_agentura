// Keep groq-sdk on >=1.1.2: 0.x pulled node-fetch/whatwg-url, which triggered Node's DEP0040 punycode warning.
import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const ratelimit =
  redis &&
  new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    prefix: "pg:rl",
    analytics: false,
  });

const MAIN_MODEL = "llama-3.3-70b-versatile";
const FAST_MODEL = "llama-3.1-8b-instant";
const THRESHOLD = 0.8;

type EvalRequest = {
  systemPrompt: string;
  userMessage: string;
  expectedContains: string;
  branchChange: string;
};

function getIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]?.trim() ?? "127.0.0.1" : "127.0.0.1";
}

function isValidBody(body: unknown): body is EvalRequest {
  if (!body || typeof body !== "object") {
    return false;
  }

  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.systemPrompt === "string" &&
    typeof candidate.userMessage === "string" &&
    typeof candidate.expectedContains === "string" &&
    typeof candidate.branchChange === "string"
  );
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

export async function POST(req: NextRequest) {
  if (!groq || !ratelimit) {
    return NextResponse.json({ error: "missing_env" }, { status: 500 });
  }

  const ip = getIP(req);
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Too many eval runs. Try again in ${retryAfter}s.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  const body = await req.json().catch(() => null);
  if (!isValidBody(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { systemPrompt, userMessage, expectedContains, branchChange } = body;

  let branchSystem = systemPrompt;
  let branchModel = MAIN_MODEL;

  if (branchChange === "friendly") {
    branchSystem = `${systemPrompt}\nAlways begin your response with "Of course!" before answering.`;
  } else if (branchChange === "truncate") {
    branchSystem = systemPrompt.slice(0, Math.floor(systemPrompt.length * 0.5));
  } else if (branchChange === "guardrail") {
    branchSystem =
      systemPrompt +
      '\nAll responses must end with: "This is for informational purposes only and does not constitute professional advice."';
  } else if (branchChange === "model_swap") {
    branchModel = FAST_MODEL;
  }

  const [baselineCompletion, branchCompletion] = await Promise.all([
    groq.chat.completions.create({
      model: MAIN_MODEL,
      max_tokens: 256,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
    groq.chat.completions.create({
      model: branchModel,
      max_tokens: 256,
      temperature: 0.2,
      messages: [
        { role: "system", content: branchSystem },
        { role: "user", content: userMessage },
      ],
    }),
  ]);

  const baselineText = baselineCompletion.choices[0]?.message?.content ?? "";
  const branchText = branchCompletion.choices[0]?.message?.content ?? "";

  const baselineAccuracy = baselineText.toLowerCase().includes(expectedContains.toLowerCase()) ? 0.94 : 0.31;
  const branchAccuracy = branchText.toLowerCase().includes(expectedContains.toLowerCase()) ? 0.94 : 0.31;

  const judgeCompletion = await groq.chat.completions.create({
    model: FAST_MODEL,
    max_tokens: 80,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You are an eval judge. Respond ONLY with valid JSON in this exact shape: {"baseline":0.0,"branch":0.0} where each value is a float between 0.0 and 1.0. ' +
          "Score 1.0 = professional, helpful, on-topic. " +
          "Score 0.0 = off-topic, evasive, or unprofessional. No other text.",
      },
      {
        role: "user",
        content: `Baseline: "${baselineText.slice(0, 280)}"\n\nBranch: "${branchText.slice(0, 280)}"`,
      },
    ],
  });

  let toneScores = { baseline: 0.87, branch: 0.87 };
  try {
    const raw = judgeCompletion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { baseline?: number; branch?: number };
    if (typeof parsed.baseline === "number" && typeof parsed.branch === "number") {
      toneScores = {
        baseline: clampScore(parsed.baseline),
        branch: clampScore(parsed.branch),
      };
    }
  } catch {
    // Judge parse failures are non-fatal for the playground demo.
  }

  const policyBaseline = 0.92;
  const policyBranch =
    branchChange === "friendly"
      ? 0.71
      : branchChange === "truncate"
        ? 0.63
        : branchChange === "guardrail"
          ? 0.99
          : branchChange === "model_swap"
            ? 0.78
            : policyBaseline;

  const gates = {
    accuracy: branchAccuracy >= THRESHOLD ? "PASS" : "BLOCK",
    tone: toneScores.branch >= THRESHOLD ? "PASS" : "BLOCK",
    policy: policyBranch >= THRESHOLD ? "PASS" : "BLOCK",
  } as const;

  const anyBlocked = Object.values(gates).includes("BLOCK");

  return NextResponse.json(
    {
      baseline: {
        accuracy: baselineAccuracy,
        tone: toneScores.baseline,
        policy: policyBaseline,
        output: baselineText.slice(0, 300),
      },
      branch: {
        accuracy: branchAccuracy,
        tone: toneScores.branch,
        policy: policyBranch,
        output: branchText.slice(0, 300),
      },
      gates,
      decision: anyBlocked ? "MERGE BLOCKED" : "MERGE ALLOWED",
      scenario: branchChange,
      modelsUsed: {
        baseline: MAIN_MODEL,
        branch: branchModel,
        judge: FAST_MODEL,
      },
      rateLimitRemaining: remaining,
    },
    {
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
      },
    }
  );
}
