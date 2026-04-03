import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
// Keep groq-sdk on >=1.1.2: 0.x pulled node-fetch/whatwg-url, which triggered Node's DEP0040 punycode warning.
import Groq from "groq-sdk";
import OpenAI from "openai";
import {
  detectOllamaJudgeModel,
  getOllamaBaseUrl,
  type OllamaFetchLike,
} from "./ollama";

export interface LlmJudgeScore {
  score: number;
  reason: string;
}

export type LlmJudgeProvider = "anthropic" | "openai" | "gemini" | "groq" | "ollama";

export interface ResolvedLlmJudgeProvider {
  provider: LlmJudgeProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export const NO_LLM_JUDGE_API_KEY_WARNING =
  "llm_judge needs a language model to run.\nAdd an API key for Anthropic, OpenAI, Gemini, or Groq,\nor start Ollama locally (ollama.com).\nThis suite will be skipped.";

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

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

interface OllamaClientLike {
  chat(params: {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: Array<{ role: "system" | "user"; content: string }>;
  }): Promise<OllamaChatResponse>;
}

type AnthropicClientFactory = (apiKey: string) => AnthropicClientLike;
type OpenAIClientFactory = (apiKey: string) => OpenAIClientLike;
type GeminiClientFactory = (apiKey: string) => GeminiClientLike;
type GroqClientFactory = (apiKey: string) => GroqClientLike;
type OllamaClientFactory = (baseUrl: string) => OllamaClientLike;

export interface LlmJudgeClientFactories {
  anthropic: AnthropicClientFactory;
  openai: OpenAIClientFactory;
  gemini: GeminiClientFactory;
  groq: GroqClientFactory;
  ollama: OllamaClientFactory;
}

const defaultAnthropicClientFactory: AnthropicClientFactory = (apiKey) =>
  new Anthropic({ apiKey }) as unknown as AnthropicClientLike;

const defaultOpenAIClientFactory: OpenAIClientFactory = (apiKey) =>
  new OpenAI({ apiKey }) as unknown as OpenAIClientLike;

const defaultGeminiClientFactory: GeminiClientFactory = (apiKey) =>
  new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;

const defaultGroqClientFactory: GroqClientFactory = (apiKey) =>
  new Groq({ apiKey }) as unknown as GroqClientLike;

const defaultOllamaClientFactory: OllamaClientFactory = (baseUrl) => ({
  chat: async ({ model, temperature, max_tokens, messages }) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: max_tokens,
        },
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Ollama chat request failed: ${response.status} ${response.statusText} ${responseText}`.trim()
      );
    }

    return (await response.json()) as OllamaChatResponse;
  },
});

const defaultClientFactories: LlmJudgeClientFactories = {
  anthropic: defaultAnthropicClientFactory,
  openai: defaultOpenAIClientFactory,
  gemini: defaultGeminiClientFactory,
  groq: defaultGroqClientFactory,
  ollama: defaultOllamaClientFactory,
};

const JUDGE_PROVIDER_PRIORITY: Array<{
  provider: LlmJudgeProvider;
  envVar: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" | "GROQ_API_KEY";
  model: string;
}> = [
  {
    provider: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001",
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

export interface LlmJudgeResolverOptions {
  fetchImpl?: OllamaFetchLike;
  ollamaAvailable?: boolean;
}

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

export function formatLlmJudgeProviderLogMessage(judge: ResolvedLlmJudgeProvider): string {
  if (judge.provider === "ollama") {
    return `llm_judge: using ollama (${judge.model}) [local]`;
  }

  return `llm_judge: using ${judge.provider} (${judge.model})`;
}

export async function resolveLlmJudgeProvider(
  env: Record<string, string | undefined> = process.env,
  options: LlmJudgeResolverOptions = {}
): Promise<ResolvedLlmJudgeProvider | null> {
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

  if (options.ollamaAvailable === false) {
    return null;
  }

  const ollamaModel = await detectOllamaJudgeModel(env, options.fetchImpl);
  if (ollamaModel) {
    return {
      provider: "ollama",
      apiKey: "",
      model: ollamaModel,
      baseUrl: getOllamaBaseUrl(env),
    };
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

    if (judge.provider === "ollama") {
      const client = clientFactories.ollama(judge.baseUrl ?? getOllamaBaseUrl());
      const response = await client.chat({
        model: judge.model,
        temperature: 0,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const responseText = response.message?.content?.trim();
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
