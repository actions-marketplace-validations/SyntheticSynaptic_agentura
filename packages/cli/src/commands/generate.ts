import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import yaml from "js-yaml";
import { z } from "zod";
import { callLLM } from "../lib/llm";

interface GenerateCommandOptions {
  description?: string;
  probe?: boolean;
  count?: string;
}

interface AgenturaConfig {
  version: number;
  agent: {
    type: "http" | "cli" | "sdk";
    endpoint?: string;
    timeout_ms?: number;
  };
  evals: Array<{ name: string; type: string }>;
}

interface ProbeResult {
  prompt: string;
  response: string;
}

interface GeneratedCase {
  input: string;
  expected: string;
}

const DEFAULT_CASE_COUNT = 15;
const PROBE_TIMEOUT_MS = 10_000;

const probeQuestions = [
  "hello, what can you help me with?",
  "what are you designed to do?",
  "give me an example of something you can help with",
];

const agenturaConfigSchema = z.object({
  version: z.number().int().positive(),
  agent: z.object({
    type: z.enum(["http", "cli", "sdk"]),
    endpoint: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
  }),
  evals: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
});

function stripCodeFences(value: string): string {
  return value
    .replace(/```jsonl?/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const suffix = defaultYes ? " [y]: " : " [n]: ";
  const answer = (await askQuestion(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }

  return answer === "y" || answer === "yes";
}

function parseCaseCount(rawCount: string | undefined): number {
  if (!rawCount) {
    return DEFAULT_CASE_COUNT;
  }

  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("--count must be a positive integer");
  }

  return parsed;
}

async function readAgenturaConfig(): Promise<AgenturaConfig> {
  const configPath = path.resolve(process.cwd(), "agentura.yaml");

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("No agentura.yaml found. Run 'agentura init' first.");
    }
    throw error;
  }

  try {
    const parsedYaml = yaml.load(raw);
    const parsed = agenturaConfigSchema.safeParse(parsedYaml);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "invalid configuration");
    }
    return parsed.data;
  } catch {
    throw new Error("Could not parse agentura.yaml — make sure it's valid YAML.");
  }
}

async function probeAgent(endpoint: string): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const prompt of probeQuestions) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}`);
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object") {
        throw new Error("invalid JSON response");
      }

      const outputValue = (payload as Record<string, unknown>).output;
      if (typeof outputValue !== "string" || !outputValue.trim()) {
        throw new Error("response missing output");
      }

      results.push({
        prompt,
        response: outputValue.trim(),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return results;
}

function buildDatasetPrompt(args: {
  description: string;
  probeResults: ProbeResult[];
  count: number;
  strict: boolean;
}): string {
  const probeSection =
    args.probeResults.length > 0
      ? `
Here are some real responses from this agent when probed:

Q: "hello, what can you help me with?"
A: "${args.probeResults[0]?.response ?? ""}"

Q: "what are you designed to do?"
A: "${args.probeResults[1]?.response ?? ""}"

Q: "give me an example of something you can help with"
A: "${args.probeResults[2]?.response ?? ""}"
`
      : "";

  const strictLine = args.strict
    ? `STRICT REQUIREMENT: Return exactly ${String(
        args.count
      )} lines. Every line must be valid JSON with "input" and "expected".`
    : "";

  return `You are an expert at writing eval test cases for AI agents.

Agent description: ${args.description}
${probeSection}
Generate exactly ${String(args.count)} test cases for this agent as JSONL.
Each line must be a valid JSON object with these fields:
- "input": a realistic question or message a user would send
- "expected": the ideal response or key information the response must contain

Requirements:
- Make inputs realistic — things actual users would type
- Cover happy path cases (normal usage)
- Cover edge cases (ambiguous queries, unusual requests)
- Cover failure modes (things the agent should handle gracefully)
- Expected values must be a specific phrase or fact
  that should appear in a correct response — not a
  topic label. Examples:
  BAD:  {"input": "what does it cost?", "expected": "pricing info"}
  GOOD: {"input": "what does it cost?", "expected": "19"}
  BAD:  {"input": "what features exist?", "expected": "feature list"}
  GOOD: {"input": "what features exist?", "expected": "task tracking"}
- Expected values should be 1-4 words that a correct
  answer would always contain.
- Do NOT include any explanation, markdown, or extra text
- Output ONLY valid JSONL — one JSON object per line
- No trailing commas, no arrays, no code fences

Example format:
{"input": "how do I reset my password?", "expected": "password reset link"}
{"input": "what payment methods do you accept?", "expected": "credit card"}

${strictLine}`.trim();
}

function buildRubricPrompt(description: string): string {
  return `You are an expert at writing evaluation rubrics for AI agents.

Agent description: ${description}

Write a quality evaluation rubric for this agent in markdown.
The rubric will be used by an LLM judge to score responses
on a scale of 0.0 to 1.0.

Requirements:
- Be specific to this agent's use case
- Define clear criteria for scores 1.0, 0.5, and 0.0
- Include 3-5 quality dimensions (accuracy, tone, completeness, etc.) relevant to this agent
- Keep it under 200 words
- Start with a # heading: "# Quality Rubric for ${description}"
- Output ONLY the markdown rubric, no extra explanation

Example structure:
# Quality Rubric for Customer Support Bot

## Score 1.0 — Excellent
- Directly addresses the user's question
- Provides actionable next steps
- Professional and empathetic tone

## Score 0.5 — Acceptable
- Partially addresses the question
- Missing some key details
- Tone is appropriate but generic

## Score 0.0 — Poor
- Does not address the question
- Contains incorrect information
- Inappropriate or unhelpful tone`;
}

function parseGeneratedCases(raw: string): GeneratedCase[] {
  const lines = stripCodeFences(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cases: GeneratedCase[] = [];

  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("line is not an object");
      }

      const inputValue = (parsed as Record<string, unknown>).input;
      const expectedValue = (parsed as Record<string, unknown>).expected;

      if (typeof inputValue !== "string" || typeof expectedValue !== "string") {
        throw new Error("missing input or expected");
      }

      const normalizedCase: GeneratedCase = {
        input: inputValue.trim(),
        expected: expectedValue.trim(),
      };

      if (!normalizedCase.input || !normalizedCase.expected) {
        throw new Error("input/expected cannot be empty");
      }

      cases.push(normalizedCase);
    } catch {
      console.log(chalk.yellow(`⚠ Skipping malformed generated line ${String(index + 1)}`));
    }
  });

  return cases;
}

async function generateCases(args: {
  description: string;
  probeResults: ProbeResult[];
  count: number;
}): Promise<GeneratedCase[]> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = buildDatasetPrompt({
      description: args.description,
      probeResults: args.probeResults,
      count: args.count,
      strict: attempt === 2,
    });

    const response = await callLLM(prompt);
    const parsedCases = parseGeneratedCases(response);

    if (parsedCases.length >= args.count) {
      return parsedCases.slice(0, args.count);
    }

    if (parsedCases.length >= 5 && attempt === 2) {
      return parsedCases;
    }

    if (parsedCases.length >= 5 && attempt === 1) {
      console.log(
        chalk.yellow(
          `Generated ${String(parsedCases.length)} valid cases, retrying once to reach ${String(
            args.count
          )}...`
        )
      );
      continue;
    }
  }

  throw new Error(
    "Generation failed — LLM returned invalid format. Try again or create evals/accuracy.jsonl manually."
  );
}

function formatJsonl(cases: GeneratedCase[]): string {
  return `${cases.map((testCase) => JSON.stringify(testCase)).join("\n")}\n`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeWithPrompt(
  filePath: string,
  content: string,
  options: { nonInteractive: boolean; defaultOverwrite: boolean }
): Promise<boolean> {
  const exists = await fileExists(filePath);
  if (exists && !options.nonInteractive) {
    const shouldOverwrite = await askYesNo(
      `${path.relative(process.cwd(), filePath)} exists. Overwrite?`,
      options.defaultOverwrite
    );
    if (!shouldOverwrite) {
      return false;
    }
  }

  await fs.writeFile(filePath, content, "utf-8");
  return true;
}

function isDefaultSingleAccuracySuite(config: AgenturaConfig): boolean {
  if (config.evals.length !== 1) {
    return false;
  }

  const [suite] = config.evals;
  return suite.name === "accuracy" && suite.type === "golden_dataset";
}

function buildThreeSuiteConfig(endpoint: string, timeoutMs: number): string {
  return `version: 1
agent:
  type: http
  endpoint: ${endpoint}
  timeout_ms: ${String(timeoutMs)}
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: semantic_similarity
    threshold: 0.8
  - name: quality
    type: llm_judge
    dataset: ./evals/quality.jsonl
    rubric: ./evals/quality-rubric.md
    threshold: 0.7
  - name: speed
    type: performance
    dataset: ./evals/accuracy.jsonl
    # Increase for LLM-backed agents (typically 3-8s)
    # Decrease for fast retrieval or classification agents
    latency_threshold_ms: 8000
    threshold: 0.8
ci:
  block_on_regression: false
  compare_to: main
  post_comment: true
`;
}

export async function generateCommand(options: GenerateCommandOptions = {}): Promise<void> {
  try {
    const config = await readAgenturaConfig();
    const count = parseCaseCount(options.count);
    const nonInteractive = Boolean(options.description) && options.probe === false;

    console.log(chalk.green("✨ Agentura Generate"));
    console.log(chalk.magenta("Generate eval test cases for your AI agent using AI"));

    const description =
      options.description?.trim() ||
      (
        await askQuestion(
          "Describe your agent in one sentence (example: customer support bot for a SaaS project tool): "
        )
      ).trim();

    if (!description) {
      console.error(chalk.red("Agent description is required."));
      process.exit(1);
    }

    let shouldProbe = options.probe;
    if (typeof shouldProbe === "undefined") {
      shouldProbe = await askYesNo("Probe your live agent to improve generation? (y/n)", true);
    }

    let probeResults: ProbeResult[] = [];
    if (shouldProbe) {
      if (config.agent.type !== "http" || !config.agent.endpoint) {
        console.log(chalk.yellow("Could not reach agent endpoint configuration — generating from description only."));
      } else {
        console.log(chalk.gray(`Probing agent at ${config.agent.endpoint}...`));
        try {
          probeResults = await probeAgent(config.agent.endpoint);
        } catch {
          console.log(
            chalk.yellow(
              `Could not reach agent at ${config.agent.endpoint} — generating from description only.`
            )
          );
          probeResults = [];
        }
      }
    }

    console.log(chalk.gray("⚡ Generating eval cases..."));
    const generatedCases = await generateCases({
      description,
      probeResults,
      count,
    });

    console.log(chalk.gray("⚡ Generating quality rubric..."));
    const rubric = await callLLM(buildRubricPrompt(description));

    const evalsDir = path.resolve(process.cwd(), "evals");
    await fs.mkdir(evalsDir, { recursive: true });

    const accuracyPath = path.join(evalsDir, "accuracy.jsonl");
    const qualityPath = path.join(evalsDir, "quality.jsonl");
    const rubricPath = path.join(evalsDir, "quality-rubric.md");

    const accuracyWrote = await writeWithPrompt(accuracyPath, formatJsonl(generatedCases), {
      nonInteractive,
      defaultOverwrite: false,
    });
    const qualityWrote = await writeWithPrompt(qualityPath, formatJsonl(generatedCases), {
      nonInteractive,
      defaultOverwrite: false,
    });
    const rubricWrote = await writeWithPrompt(rubricPath, `${rubric.trim()}\n`, {
      nonInteractive,
      defaultOverwrite: false,
    });

    let updatedYaml = false;
    if (isDefaultSingleAccuracySuite(config)) {
      const shouldUpdateYaml = nonInteractive
        ? true
        : await askYesNo(
            "Update agentura.yaml to include all 3 eval strategies? (y/n)",
            true
          );

      if (shouldUpdateYaml) {
        const endpoint = config.agent.endpoint ?? "http://localhost:3001/api/agent";
        const timeoutMs = config.agent.timeout_ms ?? 10000;
        await fs.writeFile(
          path.resolve(process.cwd(), "agentura.yaml"),
          buildThreeSuiteConfig(endpoint, timeoutMs),
          "utf-8"
        );
        updatedYaml = true;
      }
    }

    if (!accuracyWrote || !qualityWrote || !rubricWrote) {
      console.log(
        chalk.yellow(
          "Some files were skipped due to overwrite choice. Re-run generate to update remaining files."
        )
      );
    }

    console.log("");
    console.log(chalk.green(`✅ Generated eval suite for: ${description}`));
    console.log("");
    console.log("Files created:");
    console.log(
      `  evals/accuracy.jsonl     — ${String(generatedCases.length)} test cases (golden_dataset)`
    );
    console.log(
      `  evals/quality.jsonl      — ${String(generatedCases.length)} test cases (llm_judge)`
    );
    console.log("  evals/quality-rubric.md  — quality scoring rubric");
    console.log("");
    if (updatedYaml) {
      console.log("agentura.yaml updated with 3 eval strategies.");
      console.log("");
    }
    console.log("Next steps:");
    console.log("  1. Review evals/accuracy.jsonl — tweak expected values");
    console.log("     if needed (exact_match can be strict)");
    console.log("  2. Run 'agentura run' to test locally");
    console.log("  3. Push to GitHub — evals run automatically on every PR");
    console.log("");
    console.log("Tip: Switch to 'contains' scorer for faster local runs");
    console.log("     without API calls. Edit agentura.yaml to change.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "generate failed";

    if (message.includes("No Groq API key found")) {
      console.error(
        chalk.red(
          "Groq API key required. Get a free key at console.groq.com then set GROQ_API_KEY=your_key"
        )
      );
      process.exit(1);
    }

    if (message.startsWith("LLM call failed:")) {
      console.error(chalk.red(message));
      process.exit(1);
    }

    console.error(chalk.red(message));
    process.exit(1);
  }
}
