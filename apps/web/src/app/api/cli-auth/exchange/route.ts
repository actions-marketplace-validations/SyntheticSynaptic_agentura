import { NextResponse } from "next/server";
import { cleanExpiredTokens, deletePendingToken, getPendingToken } from "../../../../lib/cli-tokens";

const TOKEN_PATTERN = /^[a-zA-Z0-9]{32,64}$/;

export async function GET(request: Request) {
  cleanExpiredTokens();
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token")?.trim();

  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const pendingToken = getPendingToken(token);
  if (!pendingToken) {
    return NextResponse.json({ error: "token_not_found" }, { status: 404 });
  }

  if (!pendingToken.apiKeyRaw) {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  deletePendingToken(token);
  return NextResponse.json({
    status: "complete",
    apiKey: pendingToken.apiKeyRaw,
  });
}
