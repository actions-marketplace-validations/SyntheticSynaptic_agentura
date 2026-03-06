import { prisma } from "@agentura/db";
import { NextResponse } from "next/server";
import { generateApiKey } from "../../../../lib/api-keys";
import { fulfillToken, getPendingToken } from "../../../../lib/cli-tokens";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const TOKEN_PATTERN = /^[a-zA-Z0-9]{32,64}$/;

interface ApprovePayload {
  token?: string;
}

function metadataField(
  metadata: unknown,
  key: "provider_id" | "user_name" | "avatar_url"
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: ApprovePayload | null = null;
  try {
    payload = (await request.json()) as ApprovePayload;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const token = payload?.token?.trim();
  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ success: false, error: "invalid_token" }, { status: 400 });
  }

  const pendingToken = getPendingToken(token);
  if (!pendingToken) {
    return NextResponse.json({ success: false, error: "token_not_found" }, { status: 404 });
  }

  const githubId = metadataField(session.user.user_metadata, "provider_id");
  const githubLogin = metadataField(session.user.user_metadata, "user_name");
  const avatarUrl = metadataField(session.user.user_metadata, "avatar_url");

  if (!githubId || !githubLogin) {
    return NextResponse.json({ success: false, error: "missing_metadata" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { githubId },
    update: {
      githubLogin,
      email: session.user.email ?? null,
      avatarUrl,
    },
    create: {
      githubId,
      githubLogin,
      email: session.user.email ?? null,
      avatarUrl,
    },
    select: {
      id: true,
    },
  });

  const { raw, hash, prefix } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: "CLI (authorized via browser)",
      keyHash: hash,
      keyPrefix: prefix,
    },
    select: {
      id: true,
    },
  });

  fulfillToken(token, apiKey.id, raw);
  return NextResponse.json({ success: true });
}
