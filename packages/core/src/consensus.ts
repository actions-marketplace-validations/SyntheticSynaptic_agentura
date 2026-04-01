import {
  scoreSemanticSimilarity,
} from "@agentura/eval-runner";
import type {
  ConsensusConfig,
  ConsensusModelConfig,
  ConsensusOnDisagreement,
  ConsensusProvider,
  ConsensusResult,
  ConsensusScope,
  ModelResponse,
} from "@agentura/types";

import type { TraceFlag } from "./trace-flags";

const DEFAULT_AGREEMENT_THRESHOLD = 0.8;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1_024;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

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

interface GoogleGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export interface ConsensusCallContext {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  maxTokens: number;
  systemPrompt?: string;
  timeoutMs: number;
}

export interface RunConsensusOptions {
  agreementThreshold?: number;
  onDisagreement?: ConsensusOnDisagreement;
  timeoutMs?: number;
  maxTokens?: number;
  systemPrompt?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  callModel?: (
    input: string,
    model: ConsensusModelConfig,
    context: ConsensusCallContext
  ) => Promise<ModelResponse>;
  similarityScorer?: (left: string, right: string) => Promise<number>;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function buildPairKey(left: number, right: number): string {
  return `${String(Math.min(left, right))}:${String(Math.max(left, right))}`;
}

function getProviderApiKey(
  provider: ConsensusProvider,
  env: Record<string, string | undefined>
): string | null {
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY?.trim() || null;
  }

  if (provider === "openai") {
    return env.OPENAI_API_KEY?.trim() || null;
  }

  if (provider === "groq") {
    return env.GROQ_API_KEY?.trim() || null;
  }

  if (provider === "google" || provider === "gemini") {
    return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || null;
  }

  return null;
}

function getOllamaBaseUrl(env: Record<string, string | undefined>): string {
  return env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_OLLAMA_BASE_URL;
}

function extractAnthropicText(response: AnthropicMessageResponse): string | null {
  const textBlock = response.content?.find(
    (block) => block.type === "text" && typeof block.text === "string"
  );

  return textBlock?.text?.trim() || null;
}

function extractGoogleText(response: GoogleGenerateContentResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return text.length > 0 ? text : null;
}

function extractOpenAIText(response: OpenAICompletionResponse): string | null {
  const text = response.choices?.[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : null;
}

function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    dispose: () => {
      clearTimeout(timeoutId);
    },
  };
}

async function callAnthropicModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  const apiKey = getProviderApiKey(model.provider, context.env);
  if (!apiKey) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: 0,
      error: "Missing ANTHROPIC_API_KEY",
    };
  }

  const startedAt = Date.now();
  const timeout = createTimeoutController(context.timeoutMs);

  try {
    const response = await context.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
        max_tokens: context.maxTokens,
        ...(context.systemPrompt ? { system: context.systemPrompt } : {}),
        messages: [{ role: "user", content: input }],
      }),
      signal: timeout.controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error: `Anthropic request failed: ${response.status} ${response.statusText} ${responseText}`.trim(),
      };
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    return {
      provider: model.provider,
      model: model.model,
      response: extractAnthropicText(payload),
      latency_ms: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: Math.max(0, Date.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown Anthropic error",
    };
  } finally {
    timeout.dispose();
  }
}

async function callOpenAIModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  const apiKey = getProviderApiKey(model.provider, context.env);
  if (!apiKey) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: 0,
      error: "Missing OPENAI_API_KEY",
    };
  }

  const startedAt = Date.now();
  const timeout = createTimeoutController(context.timeoutMs);

  try {
    const response = await context.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
        max_tokens: context.maxTokens,
        messages: [
          ...(context.systemPrompt
            ? [{ role: "system" as const, content: context.systemPrompt }]
            : []),
          { role: "user" as const, content: input },
        ],
      }),
      signal: timeout.controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error: `OpenAI request failed: ${response.status} ${response.statusText} ${responseText}`.trim(),
      };
    }

    const payload = (await response.json()) as OpenAICompletionResponse;
    return {
      provider: model.provider,
      model: model.model,
      response: extractOpenAIText(payload),
      latency_ms: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: Math.max(0, Date.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown OpenAI error",
    };
  } finally {
    timeout.dispose();
  }
}

async function callGoogleModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  const apiKey = getProviderApiKey(model.provider, context.env);
  if (!apiKey) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: 0,
      error: "Missing GEMINI_API_KEY",
    };
  }

  const startedAt = Date.now();
  const timeout = createTimeoutController(context.timeoutMs);

  try {
    const response = await context.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(context.systemPrompt
            ? {
                systemInstruction: {
                  parts: [{ text: context.systemPrompt }],
                },
              }
            : {}),
          contents: [
            {
              role: "user",
              parts: [{ text: input }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: context.maxTokens,
          },
        }),
        signal: timeout.controller.signal,
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error: `Google request failed: ${response.status} ${response.statusText} ${responseText}`.trim(),
      };
    }

    const payload = (await response.json()) as GoogleGenerateContentResponse;
    return {
      provider: model.provider,
      model: model.model,
      response: extractGoogleText(payload),
      latency_ms: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: Math.max(0, Date.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown Google error",
    };
  } finally {
    timeout.dispose();
  }
}

async function callGroqModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  const apiKey = getProviderApiKey(model.provider, context.env);
  if (!apiKey) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: 0,
      error: "Missing GROQ_API_KEY",
    };
  }

  const startedAt = Date.now();
  const timeout = createTimeoutController(context.timeoutMs);

  try {
    const response = await context.fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
        max_tokens: context.maxTokens,
        messages: [
          ...(context.systemPrompt
            ? [{ role: "system" as const, content: context.systemPrompt }]
            : []),
          { role: "user" as const, content: input },
        ],
      }),
      signal: timeout.controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error: `Groq request failed: ${response.status} ${response.statusText} ${responseText}`.trim(),
      };
    }

    const payload = (await response.json()) as OpenAICompletionResponse;
    return {
      provider: model.provider,
      model: model.model,
      response: extractOpenAIText(payload),
      latency_ms: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: Math.max(0, Date.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown Groq error",
    };
  } finally {
    timeout.dispose();
  }
}

async function callOllamaModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  const startedAt = Date.now();
  const baseUrl = getOllamaBaseUrl(context.env);
  const timeout = createTimeoutController(context.timeoutMs);

  try {
    const availabilityResponse = await context.fetchImpl(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: timeout.controller.signal,
    });

    if (availabilityResponse.status !== 200) {
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: 0,
        error: "Ollama is not running. Start it with: ollama serve",
      };
    }

    const response = await context.fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model.model,
        messages: [
          ...(context.systemPrompt
            ? [{ role: "system" as const, content: context.systemPrompt }]
            : []),
          { role: "user" as const, content: input },
        ],
        stream: false,
        options: {
          temperature: 0,
          num_predict: context.maxTokens,
        },
      }),
      signal: timeout.controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        provider: model.provider,
        model: model.model,
        response: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error: `Ollama request failed: ${response.status} ${response.statusText} ${responseText}`.trim(),
      };
    }

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    return {
      provider: model.provider,
      model: model.model,
      response: payload.message?.content?.trim() || null,
      latency_ms: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return {
      provider: model.provider,
      model: model.model,
      response: null,
      latency_ms: 0,
      error: "Ollama is not running. Start it with: ollama serve",
    };
  } finally {
    timeout.dispose();
  }
}

async function defaultCallModel(
  input: string,
  model: ConsensusModelConfig,
  context: ConsensusCallContext
): Promise<ModelResponse> {
  if (model.provider === "anthropic") {
    return callAnthropicModel(input, model, context);
  }

  if (model.provider === "openai") {
    return callOpenAIModel(input, model, context);
  }

  if (model.provider === "groq") {
    return callGroqModel(input, model, context);
  }

  if (model.provider === "ollama") {
    return callOllamaModel(input, model, context);
  }

  return callGoogleModel(input, model, context);
}

async function defaultSimilarityScorer(left: string, right: string): Promise<number> {
  try {
    return await scoreSemanticSimilarity(left, right, {
      allowFallback: true,
    });
  } catch {
    return normalizeText(left) === normalizeText(right) ? 1 : 0;
  }
}

function findMajorityWinnerIndex(responses: ModelResponse[]): number {
  const counts = new Map<string, { count: number; firstIndex: number }>();

  responses.forEach((response, index) => {
    const normalized = normalizeText(response.response ?? "");
    const current = counts.get(normalized);
    if (current) {
      current.count += 1;
      return;
    }

    counts.set(normalized, { count: 1, firstIndex: index });
  });

  const majority = Math.floor(responses.length / 2) + 1;
  for (const entry of counts.values()) {
    if (entry.count >= majority) {
      return entry.firstIndex;
    }
  }

  return -1;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function buildSimilarityMap(
  responses: ModelResponse[],
  similarityScorer: (left: string, right: string) => Promise<number>
): Promise<Map<string, number>> {
  const pairs: Array<Promise<[string, number]>> = [];

  for (let leftIndex = 0; leftIndex < responses.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < responses.length; rightIndex += 1) {
      const left = responses[leftIndex]?.response ?? "";
      const right = responses[rightIndex]?.response ?? "";
      pairs.push(
        similarityScorer(left, right).then((value) => [
          buildPairKey(leftIndex, rightIndex),
          clampRate(value),
        ])
      );
    }
  }

  const resolvedPairs = await Promise.all(pairs);
  return new Map(resolvedPairs);
}

function getPairSimilarity(
  similarityMap: Map<string, number>,
  leftIndex: number,
  rightIndex: number
): number {
  if (leftIndex === rightIndex) {
    return 1;
  }

  return similarityMap.get(buildPairKey(leftIndex, rightIndex)) ?? 0;
}

function buildDegradedFlag(responses: ModelResponse[]): TraceFlag | null {
  const failedModels = responses
    .filter((response) => response.error)
    .map((response) => formatConsensusModelId(response));

  if (failedModels.length === 0) {
    return null;
  }

  const successfulModels = responses
    .filter((response) => !response.error && typeof response.response === "string")
    .map((response) => formatConsensusModelId(response));

  return {
    type: "degraded_consensus",
    failed_models: failedModels,
    successful_models: successfulModels,
  };
}

function buildPrimaryFlag(
  agreementRate: number,
  agreementThreshold: number,
  responses: ModelResponse[]
): ConsensusResult["flag"] {
  if (agreementRate < agreementThreshold) {
    return {
      type: "consensus_disagreement",
      agreement_rate: agreementRate,
    };
  }

  const degradedFlag = buildDegradedFlag(responses);
  if (degradedFlag?.type === "degraded_consensus") {
    return degradedFlag;
  }

  return null;
}

export function formatConsensusModelId(model: Pick<ModelResponse, "provider" | "model">): string {
  return `${model.provider}:${model.model}`;
}

export function parseConsensusModelSpecifier(specifier: string): ConsensusModelConfig {
  const [rawProvider, ...modelParts] = specifier.split(":");
  const provider = rawProvider?.trim().toLowerCase();
  const model = modelParts.join(":").trim();

  if (!provider || !model) {
    throw new Error(
      `Invalid consensus model "${specifier}". Expected provider:model, for example anthropic:claude-sonnet-4-6`
    );
  }

  if (
    provider !== "anthropic" &&
    provider !== "openai" &&
    provider !== "google" &&
    provider !== "gemini" &&
    provider !== "groq" &&
    provider !== "ollama"
  ) {
    throw new Error(`Unsupported consensus provider "${provider}".`);
  }

  return {
    provider: provider === "gemini" ? "google" : provider,
    model,
  };
}

export function normalizeConsensusModels(
  models: Array<ConsensusModelConfig | string>
): ConsensusModelConfig[] {
  return models.map((model) =>
    typeof model === "string" ? parseConsensusModelSpecifier(model) : model
  );
}

export function shouldRunConsensus(
  config: Pick<ConsensusConfig, "scope" | "high_stakes_tools">,
  toolNames: string[]
): boolean {
  if (config.scope === "all") {
    return true;
  }

  const configuredTools = new Set((config.high_stakes_tools ?? []).map((tool) => tool.trim()));
  return toolNames.some((toolName) => configuredTools.has(toolName));
}

export function buildConsensusTraceFlags(
  result: ConsensusResult,
  agreementThreshold = DEFAULT_AGREEMENT_THRESHOLD
): TraceFlag[] {
  const flags: TraceFlag[] = [];
  const degradedFlag = buildDegradedFlag(result.responses);
  if (degradedFlag) {
    flags.push(degradedFlag);
  }

  if (result.agreement_rate < agreementThreshold) {
    flags.push({
      type: "consensus_disagreement",
      agreement_rate: result.agreement_rate,
    });
  }

  return flags;
}

export async function runConsensus(
  input: string,
  models: Array<ConsensusModelConfig | string>,
  options: RunConsensusOptions = {}
): Promise<ConsensusResult> {
  const normalizedModels = normalizeConsensusModels(models);
  const agreementThreshold = options.agreementThreshold ?? DEFAULT_AGREEMENT_THRESHOLD;
  const callModel = options.callModel ?? defaultCallModel;
  const similarityScorer = options.similarityScorer ?? defaultSimilarityScorer;
  const context: ConsensusCallContext = {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl ?? fetch,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    systemPrompt: options.systemPrompt,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  const responses = await Promise.all(
    normalizedModels.map((model) => callModel(input, model, context))
  );
  const successfulResponses = responses.filter(
    (response): response is ModelResponse & { response: string } =>
      !response.error && typeof response.response === "string" && response.response.length > 0
  );

  if (successfulResponses.length === 0) {
    return {
      winning_response: "",
      agreement_rate: 0,
      responses,
      dissenting_models: [],
      flag: buildPrimaryFlag(0, agreementThreshold, responses),
    };
  }

  const similarityMap = await buildSimilarityMap(successfulResponses, similarityScorer);
  const pairwiseScores: number[] = [];
  for (let leftIndex = 0; leftIndex < successfulResponses.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < successfulResponses.length; rightIndex += 1) {
      pairwiseScores.push(getPairSimilarity(similarityMap, leftIndex, rightIndex));
    }
  }

  const agreementRate = pairwiseScores.length > 0 ? mean(pairwiseScores) : 0;
  const majorityWinnerIndex = findMajorityWinnerIndex(successfulResponses);
  const winnerIndex =
    majorityWinnerIndex >= 0
      ? majorityWinnerIndex
      : successfulResponses.reduce((bestIndex, response, responseIndex) => {
          const candidateMean = mean(
            successfulResponses
              .map((_, otherIndex) => {
                if (otherIndex === responseIndex) {
                  return null;
                }

                return getPairSimilarity(similarityMap, responseIndex, otherIndex);
              })
              .filter((value): value is number => typeof value === "number")
          );
          const bestMean = mean(
            successfulResponses
              .map((_, otherIndex) => {
                if (otherIndex === bestIndex) {
                  return null;
                }

                return getPairSimilarity(similarityMap, bestIndex, otherIndex);
              })
              .filter((value): value is number => typeof value === "number")
          );

          return candidateMean > bestMean ? responseIndex : bestIndex;
        }, 0);
  const winningResponse = successfulResponses[winnerIndex]?.response ?? "";
  const winningNormalized = normalizeText(winningResponse);
  const dissentingModels = successfulResponses
    .filter((response, responseIndex) => {
      if (responseIndex === winnerIndex) {
        return false;
      }

      if (normalizeText(response.response) === winningNormalized) {
        return false;
      }

      return getPairSimilarity(similarityMap, responseIndex, winnerIndex) < agreementThreshold;
    })
    .map((response) => formatConsensusModelId(response));

  return {
    winning_response: winningResponse,
    agreement_rate: agreementRate,
    responses,
    dissenting_models: dissentingModels,
    flag: buildPrimaryFlag(agreementRate, agreementThreshold, responses),
  };
}

export const __testing = {
  normalizeText,
};
