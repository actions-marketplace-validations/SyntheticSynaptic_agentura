import express from "express";

const app = express();
app.use(express.json());

app.post("/invoke", (req, res) => {
  const input = String(req.body?.input ?? "").toLowerCase();
  if (input.includes("base url")) return res.json({ output: "The default API base URL is https://api.docuroute.dev/v1." });
  if (input.includes("auth")) return res.json({ output: "DocuRoute uses bearer tokens in the Authorization header." });
  if (input.includes("pagination")) return res.json({ output: "List endpoints paginate with cursor and limit parameters." });
  if (input.includes("rate limit")) return res.json({ output: "The default rate limit is 120 requests per minute." });
  if (input.includes("webhook")) return res.json({ output: "Webhooks can be signed with the X-DocuRoute-Signature header." });
  if (input.includes("sdk")) return res.json({ output: "Official SDKs are available for JavaScript and Python." });
  if (input.includes("retry")) return res.json({ output: "Retry 429 and 5xx responses with exponential backoff." });
  if (input.includes("sandbox")) return res.json({ output: "Use the sandbox key prefix dr_sandbox_ for test environments." });
  if (input.includes("delete")) return res.json({ output: "DELETE endpoints return 204 on success." });
  return res.json({ output: "DocuRoute is a REST API documentation platform with searchable endpoint guides." });
});

app.listen(3458, () => {
  console.log("HTTP example agent listening on http://localhost:3458/invoke");
});
