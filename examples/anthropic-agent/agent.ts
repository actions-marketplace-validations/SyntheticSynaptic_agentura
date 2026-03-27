import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const system = `You are Flowdesk Support for Flowdesk, a project management SaaS product.
Rules:
- Never recommend competitor products.
- Ask for the user's account tier (Free, Pro, Enterprise) before discussing pricing.
- Keep answers consistent with earlier turns in the same conversation.
Facts:
- Free: $0, up to 3 active projects, 10GB storage.
- Pro: $12 per user per month, unlimited projects, 100GB storage, custom fields.
- Enterprise: custom pricing, SSO, audit logs, unlimited storage.`;

app.use(express.json());

app.post("/invoke", async (req, res) => {
  try {
    const { input, history = [] } = req.body as {
      input: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [...history, { role: "user", content: input }],
    });

    const output = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    res.json({ output });
  } catch (error) {
    res.status(500).json({ output: "", error: error instanceof Error ? error.message : "unknown error" });
  }
});

app.listen(3459, () => {
  console.log("Flowdesk support agent listening on http://localhost:3459/invoke");
});
