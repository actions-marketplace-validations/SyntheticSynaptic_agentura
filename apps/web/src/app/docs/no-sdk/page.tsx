import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const pythonExample = `@app.post("/api/agent")
async def agent(req: dict):
    response = your_llm_call(req["input"])
    return {"output": response}`;

const nodeExample = `app.post('/api/agent', async (req, res) => {
  const response = await yourLLMCall(req.body.input)
  res.json({ output: response })
})`;

const curlExample = `curl -X POST https://your-agent.com/api/agent \\
  -H "Content-Type: application/json" \\
  -d '{"input": "hello"}'
# Should return: {"output": "..."}`;

export default function DocsNoSdkPage() {
  return (
    <ProseSection title="No SDK Required" subtitle="Why this matters and how it works">
      <section>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Tools like Braintrust, LangSmith, and Promptfoo typically require SDK integration or
          framework-specific wiring. Agentura does not. If your agent exposes an HTTP endpoint,
          Agentura can evaluate it immediately.
        </p>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Integration contract:
          <br />
          POST with <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">{`{ "input": "..." }`}</code>
          <br />
          Return <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">{`{ "output": "..." }`}</code>
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Why this is better
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Test the real thing (same request path as production traffic)</li>
          <li>Language agnostic (Python, Node, Go, Rust, anything)</li>
          <li>No vendor lock-in (remove agentura.yaml and you&apos;re done)</li>
          <li>Works with existing agents immediately</li>
        </ol>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Minimal examples
        </h2>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Python (FastAPI)</h3>
        <CodeBlock code={pythonExample} language="python" />
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Node.js (Express)</h3>
        <CodeBlock code={nodeExample} language="javascript" />
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">cURL test</h3>
        <CodeBlock code={curlExample} language="bash" />
      </section>
    </ProseSection>
  );
}
