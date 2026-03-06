import { NextResponse } from "next/server";
import { createPendingToken } from "../../../../lib/cli-tokens";

const TOKEN_PATTERN = /^[a-zA-Z0-9]{32,64}$/;

interface RequestPayload {
  token?: string;
}

export async function POST(request: Request) {
  let payload: RequestPayload | null = null;

  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const token = payload?.token?.trim();
  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ success: false, error: "invalid_token" }, { status: 400 });
  }

  createPendingToken(token);
  return NextResponse.json({ success: true });
}
