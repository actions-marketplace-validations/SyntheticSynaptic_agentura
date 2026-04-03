import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveConfig } from "./config";

interface GroqMessage {
  content: string | null | Array<{ text?: string }>;
}

interface GroqCompletionResponse {
  choices?: Array<{ message?: GroqMessage }>;
}

interface GroqClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        max_tokens: number;
        temperature: number;
        messages: Array<{ role: "system" | "user"; content: string }>;
      }) => Promise<GroqCompletionResponse>;
    };
  };
}

type GroqConstructor = new (options: { apiKey: string }) => GroqClient;
type CallLLMInput =
  | string
  | {
      prompt: string;
      systemPrompt?: string;
    };

function importModule(specifier: string): Promise<unknown> {
  const importer = Function("specifier", "return import(specifier)") as (
    value: string
  ) => Promise<unknown>;
  return importer(specifier);
}

async function saveGroqApiKey(apiKey: string): Promise<void> {
  const existingConfig = await loadConfig();
  await saveConfig({
    ...(existingConfig ?? {}),
    groqApiKey: apiKey,
  });
}

async function promptForGroqApiKey(): Promise<string | null> {
  const rl = createInterface({ input, output });
  try {
    const answer = (
      await rl.question("Enter your Groq API key (free at console.groq.com): ")
    ).trim();
    return answer || null;
  } finally {
    rl.close();
  }
}

async function getGroqApiKey(): Promise<string | null> {
  const fromEnv = process.env.GROQ_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const config = await loadConfig();
  const fromConfig = config?.groqApiKey?.trim();
  if (fromConfig) {
    return fromConfig;
  }

  const entered = await promptForGroqApiKey();
  if (!entered) {
    return null;
  }

  await saveGroqApiKey(entered);
  return entered;
}

function extractText(response: GroqCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text;
  }

  return "";
}

export async function callLLM(inputValue: CallLLMInput): Promise<string> {
  const apiKey = await getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      "No Groq API key found. Set GROQ_API_KEY or run agentura generate and enter it when prompted."
    );
  }

  const prompt = typeof inputValue === "string" ? inputValue : inputValue.prompt;
  const systemPrompt =
    typeof inputValue === "string" ? undefined : inputValue.systemPrompt?.trim() || undefined;

  try {
    // Keep groq-sdk on >=1.1.2: 0.x pulled node-fetch/whatwg-url, which triggered Node's DEP0040 punycode warning.
    const moduleNamespace = (await importModule("groq-sdk")) as { default?: GroqConstructor };
    const Groq = moduleNamespace.default;

    if (!Groq) {
      throw new Error("groq-sdk default export was not found");
    }

    const client = new Groq({ apiKey });
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      temperature: 0.7,
      messages: systemPrompt
        ? [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ]
        : [{ role: "user", content: prompt }],
    });

    const text = extractText(response);
    if (!text) {
      throw new Error("received empty response from LLM");
    }

    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown Groq API error";
    throw new Error(`LLM call failed: ${message}`);
  }
}
