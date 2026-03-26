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
      const usedCalculator = Array.isArray(result.intermediateSteps)
        && result.intermediateSteps.some((step: { action?: { tool?: string } }) => step.action?.tool === "calculator");
      const output = `${usedCalculator ? "[tool:calculator] " : ""}${String(result.output ?? "").trim()}`;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ output }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ output: "", error: error instanceof Error ? error.message : "unknown error" }));
    }
  });
}).listen(3457, () => {
  console.log("LangChain calculator agent listening on http://localhost:3457/invoke");
});
