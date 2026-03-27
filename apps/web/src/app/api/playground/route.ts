import { NextResponse } from "next/server";
import { z } from "zod";

const BASELINE_MODEL = "claude-sonnet-4-20250514";
const FAST_MODEL = "claude-haiku-4-5-20251001";

const playgroundSchema = z.object({
  systemPrompt: z.string().trim().min(20).max(4000),
  testInput: z.string().trim().min(3).max(500),
  expectedContains: z.string().trim().min(1).max(200),
  branchChange: z.enum(["friendlier_tone", "model_swap", "context_truncation"]),
});

type PlaygroundRequest = z.infer<typeof playgroundSchema>;

type CompletionResult = {
  output: string;
  accuracy: number;
  tone: number;
};

function clampScore(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function includesExpected(output: string, expected: string) {
  return output.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;
}

function extractText(payload: unknown) {
  const text = z
    .object({
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
        })
      ),
    })
    .safeParse(payload);

  if (!text.success) {
    throw new Error("Anthropic response could not be parsed");
  }

  return text.data.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function parseToneScore(raw: string) {
  try {
    const json = JSON.parse(raw) as { score?: number };
    if (typeof json.score === "number") {
      return clampScore(json.score);
    }
  } catch {
    // Fall through to regex parse.
  }

  const match = raw.match(/([01](?:\.\d+)?)/);
  return clampScore(match ? Number(match[1]) : 0);
}

async function callAnthropicText({
  apiKey,
  model,
  system,
  prompt,
  maxTokens = 220,
}: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${response.statusText} ${errorText}`.trim());
  }

  return extractText(await response.json());
}

async function scoreTone({
  apiKey,
  responseText,
  toneTarget,
}: {
  apiKey: string;
  responseText: string;
  toneTarget: string;
}) {
  const raw = await callAnthropicText({
    apiKey,
    model: FAST_MODEL,
    system: "You score response tone. Return strict JSON only: {\"score\": 0.00}.",
    prompt: `Does the following response sound ${toneTarget}? Score from 0 to 1.\n\nResponse:\n${responseText}`,
    maxTokens: 60,
  });

  return parseToneScore(raw);
}

function applyBranchChange(request: PlaygroundRequest) {
  switch (request.branchChange) {
    case "friendlier_tone":
      return {
        systemPrompt: `${request.systemPrompt}\n\nAdopt a warmer, friendlier tone. Start the response with "Of course!" when appropriate.`,
        model: BASELINE_MODEL,
        toneTarget: "friendly and helpful",
      };
    case "model_swap":
      return {
        systemPrompt: request.systemPrompt,
        model: FAST_MODEL,
        toneTarget: "professional and concise",
      };
    case "context_truncation":
      return {
        systemPrompt: request.systemPrompt.slice(0, Math.max(80, Math.floor(request.systemPrompt.length / 2))),
        model: BASELINE_MODEL,
        toneTarget: "professional and concise",
      };
  }
}

function createMockResponse(request: PlaygroundRequest) {
  const baselineOutput = `Our return policy gives customers ${request.expectedContains}. Please include your order number when contacting support.`;

  let branchOutput = baselineOutput;
  let branchTone = 0.94;

  if (request.branchChange === "friendlier_tone") {
    branchOutput = `Of course! Our return policy gives customers ${request.expectedContains}. Please include your order number when contacting support.`;
    branchTone = 0.94;
  }

  if (request.branchChange === "model_swap") {
    branchOutput = "We support eligible returns depending on the item and order details. Contact support for the current policy window.";
    branchTone = 0.71;
  }

  if (request.branchChange === "context_truncation") {
    branchOutput = "Returns are reviewed case by case. Support can confirm the current policy for your order.";
    branchTone = 0.76;
  }

  const baselineAccuracy = includesExpected(baselineOutput, request.expectedContains);
  const branchAccuracy = includesExpected(branchOutput, request.expectedContains);
  const accuracyDelta = branchAccuracy - baselineAccuracy;
  const blocked = branchAccuracy < 0.8 || accuracyDelta < -0.05;

  return {
    suite: "golden_dataset",
    mode: "mock" as const,
    toneTarget: request.branchChange === "friendlier_tone" ? "friendly and helpful" : "professional and concise",
    baseline: {
      output: baselineOutput,
      accuracy: baselineAccuracy,
      tone: 0.82,
    },
    branch: {
      output: branchOutput,
      accuracy: branchAccuracy,
      tone: branchTone,
    },
    gate: {
      blocked,
      decision: blocked ? "MERGE BLOCKED" : "MERGE ALLOWED",
      reason: blocked
        ? "accuracy regressed below threshold (0.80)"
        : "branch stayed above threshold and did not regress beyond tolerance",
      threshold: 0.8,
      delta: accuracyDelta,
    },
  };
}

async function runLiveResponse(request: PlaygroundRequest, apiKey: string) {
  const branchConfig = applyBranchChange(request);
  const userPrompt = `${request.testInput}\n\nAnswer directly and only use the available policy information.`;

  const baselineOutput = await callAnthropicText({
    apiKey,
    model: BASELINE_MODEL,
    system: request.systemPrompt,
    prompt: userPrompt,
  });

  const branchOutput = await callAnthropicText({
    apiKey,
    model: branchConfig.model,
    system: branchConfig.systemPrompt,
    prompt: userPrompt,
  });

  const baselineAccuracy = includesExpected(baselineOutput, request.expectedContains);
  const branchAccuracy = includesExpected(branchOutput, request.expectedContains);

  const [baselineTone, branchTone] = await Promise.all([
    scoreTone({
      apiKey,
      responseText: baselineOutput,
      toneTarget: branchConfig.toneTarget,
    }),
    scoreTone({
      apiKey,
      responseText: branchOutput,
      toneTarget: branchConfig.toneTarget,
    }),
  ]);

  const accuracyDelta = branchAccuracy - baselineAccuracy;
  const blocked = branchAccuracy < 0.8 || accuracyDelta < -0.05;

  return {
    suite: "golden_dataset",
    mode: "live" as const,
    toneTarget: branchConfig.toneTarget,
    baseline: {
      output: baselineOutput,
      accuracy: baselineAccuracy,
      tone: baselineTone,
    },
    branch: {
      output: branchOutput,
      accuracy: branchAccuracy,
      tone: branchTone,
    },
    gate: {
      blocked,
      decision: blocked ? "MERGE BLOCKED" : "MERGE ALLOWED",
      reason: blocked
        ? "accuracy regressed below threshold (0.80)"
        : "branch stayed above threshold and did not regress beyond tolerance",
      threshold: 0.8,
      delta: accuracyDelta,
    },
  };
}

export async function POST(request: Request) {
  try {
    const parsed = playgroundSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playground request" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(createMockResponse(parsed.data));
    }

    return NextResponse.json(await runLiveResponse(parsed.data, apiKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown playground error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
