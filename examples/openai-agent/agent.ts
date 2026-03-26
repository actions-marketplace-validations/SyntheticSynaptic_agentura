import { createServer } from "node:http";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const system = `You are AcmeBot Support, a concise customer support bot for AcmeBot, a task management tool.
Facts: free plan = 3 projects and 5 collaborators; Pro = $12/user/month; SSO = Enterprise only; deleted tasks can be restored for 30 days; integrations include Slack, GitHub, and Google Calendar; CSV import is supported; custom fields start on Pro.
If a policy or feature is unknown, say you do not know instead of inventing it.`;

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
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: input },
        ],
      });
      const output = completion.choices[0]?.message?.content?.trim() ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ output }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ output: "", error: error instanceof Error ? error.message : "unknown error" }));
    }
  });
}).listen(3456, () => {
  console.log("AcmeBot listening on http://localhost:3456/invoke");
});
