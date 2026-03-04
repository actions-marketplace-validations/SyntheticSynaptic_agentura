import { prisma } from "@agentura/db";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange_failed", requestUrl.origin));
  }

  const session = data.session;
  const githubId = metadataField(session.user.user_metadata, "provider_id");
  const githubLogin = metadataField(session.user.user_metadata, "user_name");
  const avatarUrl = metadataField(session.user.user_metadata, "avatar_url");

  if (!githubId || !githubLogin) {
    return NextResponse.redirect(new URL("/login?error=missing_metadata", requestUrl.origin));
  }

  await prisma.user.upsert({
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
  });

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
