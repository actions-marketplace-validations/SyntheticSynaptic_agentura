import { createServer } from "node:http";
import { evaluate } from "mathjs";
import { DynamicTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";

const calculator = new DynamicTool({
  name: "calculator",
  description: "Use this for arithmetic or multi-step math expressions.",
  func: async (input: string) => String(evaluate(input)),
});

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
const executor = await initializeAgentExecutorWithOptions([calculator], llm, {
  agentType: "zero-shot-react-description",
  returnIntermediateSteps: true,
  verbose: false,
});

interface IntermediateStepAction {
  tool?: unknown;
  toolInput?: unknown;
}

interface IntermediateStep {
  action?: IntermediateStepAction;
  observation?: unknown;
}

function toStructuredArgs(toolName: string, toolInput: unknown): Record<string, unknown> | undefined {
  if (typeof toolInput === "string") {
    return toolName === "calculator"
      ? { expression: toolInput }
      : { input: toolInput };
  }

  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    return toolInput as Record<string, unknown>;
  }

  return undefined;
}

function stringifyObservation(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function toToolCalls(steps: unknown): Array<{
  name: string;
  args?: Record<string, unknown>;
  result?: string;
}> {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step): {
      name: string;
      args?: Record<string, unknown>;
      result?: string;
    } | null => {
      const typedStep = step as IntermediateStep;
      const toolName = typedStep.action?.tool;
      if (typeof toolName !== "string") {
        return null;
      }

      const args = toStructuredArgs(toolName, typedStep.action?.toolInput);
      const result = stringifyObservation(typedStep.observation);

      return {
        name: toolName,
        ...(args ? { args } : {}),
        ...(result ? { result } : {}),
      };
    })
    .filter((value): value is { name: string; args?: Record<string, unknown>; result?: string } => value !== null);
}

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/invoke") {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const { input } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { input: string };
      const result = await executor.invoke({ input });
      const output = String(result.output ?? "").trim();
      const toolCalls = toToolCalls(result.intermediateSteps);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ output, tool_calls: toolCalls }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ output: "", error: error instanceof Error ? error.message : "unknown error" }));
    }
  });
}).listen(3457, () => {
  console.log("LangChain calculator agent listening on http://localhost:3457/invoke");
});
