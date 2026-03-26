import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import OpenAI from "openai";

export interface LlmJudgeScore {
  score: number;
  reason: string;
}

export type LlmJudgeProvider = "anthropic" | "openai" | "gemini" | "groq";

export interface ResolvedLlmJudgeProvider {
  provider: LlmJudgeProvider;
  apiKey: string;
  model: string;
}

export const NO_LLM_JUDGE_API_KEY_WARNING =
  "llm_judge suites skipped: set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY to run them";

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface OpenAICompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface AnthropicClientLike {
  messages: {
    create(params: {
      model: string;
      temperature: number;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<AnthropicMessageResponse>;
  };
}

interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: "system" | "user"; content: string }>;
      }): Promise<OpenAICompletionResponse>;
    };
  };
}

interface GeminiGenerateContentResponse {
  text?: string;
}

interface GeminiClientLike {
  models: {
    generateContent(params: {
      model: string;
      contents: string;
      config: {
        systemInstruction: string;
        temperature: number;
        maxOutputTokens: number;
      };
    }): Promise<GeminiGenerateContentResponse>;
  };
}

interface GroqClientLike {
  chat: {
    completions: {
      create(params: {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: "system" | "user"; content: string }>;
      }): Promise<OpenAICompletionResponse>;
    };
  };
}

type AnthropicClientFactory = (apiKey: string) => AnthropicClientLike;
type OpenAIClientFactory = (apiKey: string) => OpenAIClientLike;
type GeminiClientFactory = (apiKey: string) => GeminiClientLike;
type GroqClientFactory = (apiKey: string) => GroqClientLike;

export interface LlmJudgeClientFactories {
  anthropic: AnthropicClientFactory;
  openai: OpenAIClientFactory;
  gemini: GeminiClientFactory;
  groq: GroqClientFactory;
}

const defaultAnthropicClientFactory: AnthropicClientFactory = (apiKey) =>
  new Anthropic({ apiKey }) as unknown as AnthropicClientLike;

const defaultOpenAIClientFactory: OpenAIClientFactory = (apiKey) =>
  new OpenAI({ apiKey }) as unknown as OpenAIClientLike;

const defaultGeminiClientFactory: GeminiClientFactory = (apiKey) =>
  new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;

const defaultGroqClientFactory: GroqClientFactory = (apiKey) =>
  new Groq({ apiKey }) as unknown as GroqClientLike;

const defaultClientFactories: LlmJudgeClientFactories = {
  anthropic: defaultAnthropicClientFactory,
  openai: defaultOpenAIClientFactory,
  gemini: defaultGeminiClientFactory,
  groq: defaultGroqClientFactory,
};

const JUDGE_PROVIDER_PRIORITY: Array<{
  provider: LlmJudgeProvider;
  envVar: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" | "GROQ_API_KEY";
  model: string;
}> = [
  {
    provider: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    model: "claude-3-5-haiku-20241022",
  },
  {
    provider: "openai",
    envVar: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
  },
  {
    provider: "gemini",
    envVar: "GEMINI_API_KEY",
    model: "gemini-2.0-flash",
  },
  {
    provider: "groq",
    envVar: "GROQ_API_KEY",
    model: "llama-3.1-8b-instant",
  },
];

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function stripCodeFences(text: string): string {
  return text.replace(/```json\n?|\n?```/g, "").trim();
}

function parseJudgeJson(text: string): LlmJudgeScore {
  try {
    const parsed = JSON.parse(stripCodeFences(text)) as Record<string, unknown>;
    const rawScore = parsed.score;
    const rawReason = parsed.reason;

    if (typeof rawScore !== "number") {
      return { score: 0, reason: "Judge response parse error" };
    }

    return {
      score: clampScore(rawScore),
      reason:
        typeof rawReason === "string" && rawReason.trim().length > 0
          ? rawReason.trim()
          : "Judge response parse error",
    };
  } catch {
    return { score: 0, reason: "Judge response parse error" };
  }
}

function buildJudgePrompts(
  input: string,
  output: string,
  rubric: string,
  context?: string
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const promptLines = [
    "Rubric:",
    rubric,
    "",
    `Input: ${input}`,
  ];

  if (context && context.trim().length > 0) {
    promptLines.push(`Context: ${context.trim()}`);
  }

  promptLines.push(
    `Output: ${output}`,
    "",
    "Respond with JSON only:",
    '{"score": 0.0-1.0, "reason": "one sentence explanation"}'
  );

  return {
    systemPrompt:
      "You are an eval judge. Score the output strictly according to the rubric. Respond only in JSON.",
    userPrompt: promptLines.join("\n"),
  };
}

function extractAnthropicText(response: AnthropicMessageResponse): string | null {
  const textBlock = response.content?.find(
    (block) => block.type === "text" && typeof block.text === "string"
  );
  return textBlock?.text?.trim() || null;
}

export function resolveLlmJudgeProvider(
  env: Record<string, string | undefined> = process.env
): ResolvedLlmJudgeProvider | null {
  for (const candidate of JUDGE_PROVIDER_PRIORITY) {
    const apiKey = env[candidate.envVar]?.trim();
    if (apiKey) {
      return {
        provider: candidate.provider,
        apiKey,
        model: candidate.model,
      };
    }
  }

  return null;
}

export async function scoreLlmJudge(
  input: string,
  output: string,
  rubric: string,
  judge: ResolvedLlmJudgeProvider,
  context?: string,
  clientFactories: LlmJudgeClientFactories = defaultClientFactories
): Promise<LlmJudgeScore> {
  try {
    const { systemPrompt, userPrompt } = buildJudgePrompts(input, output, rubric, context);

    if (judge.provider === "anthropic") {
      const client = clientFactories.anthropic(judge.apiKey);
      const response = await client.messages.create({
        model: judge.model,
        temperature: 0,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const responseText = extractAnthropicText(response);
      if (!responseText) {
        return { score: 0, reason: "Judge response parse error" };
      }

      return parseJudgeJson(responseText);
    }

    if (judge.provider === "openai") {
      const client = clientFactories.openai(judge.apiKey);
      const response = await client.chat.completions.create({
        model: judge.model,
        temperature: 0,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const responseText = response.choices?.[0]?.message?.content;
      if (!responseText || responseText.trim().length === 0) {
        return { score: 0, reason: "Judge response parse error" };
      }

      return parseJudgeJson(responseText);
    }

    if (judge.provider === "gemini") {
      const client = clientFactories.gemini(judge.apiKey);
      const response = await client.models.generateContent({
        model: judge.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0,
          maxOutputTokens: 1024,
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        return { score: 0, reason: "Judge response parse error" };
      }

      return parseJudgeJson(responseText);
    }

    const client = clientFactories.groq(judge.apiKey);
    const response = await client.chat.completions.create({
      model: judge.model,
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const responseText = response.choices?.[0]?.message?.content;
    if (!responseText || responseText.trim().length === 0) {
      return { score: 0, reason: "Judge response parse error" };
    }

    return parseJudgeJson(responseText);
  } catch {
    return { score: 0, reason: "Judge response parse error" };
  }
}
