import { createHash } from "node:crypto";
import { prisma } from "@agentura/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createSupabaseServerClient } from "../lib/supabase/server";

export interface ContextUser {
  id: string;
  githubLogin: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface TRPCContext {
  user: ContextUser | null;
  headers: Headers | null;
}

function parseBearerToken(headers: Headers | undefined): string | null {
  const authorizationHeader = headers?.get("authorization");
  if (!authorizationHeader) {
    return null;
  }

  const bearerPrefix = "Bearer ";
  if (!authorizationHeader.startsWith(bearerPrefix)) {
    return null;
  }

  const token = authorizationHeader.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : null;
}

function readProviderMetadata(sessionUser: { user_metadata?: unknown }) {
  const metadata = sessionUser.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return { providerId: null, userName: null, avatarUrl: null };
  }

  const record = metadata as Record<string, unknown>;
  const providerId =
    typeof record.provider_id === "string" ? record.provider_id : null;
  const userName = typeof record.user_name === "string" ? record.user_name : null;
  const avatarUrl = typeof record.avatar_url === "string" ? record.avatar_url : null;

  return { providerId, userName, avatarUrl };
}

export async function createTRPCContext(
  options: { headers?: Headers } = {}
): Promise<TRPCContext> {
  let user: ContextUser | null = null;

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const { providerId } = readProviderMetadata(session.user);

    if (providerId) {
      const dbUser = await prisma.user.findUnique({
        where: { githubId: providerId },
        select: {
          id: true,
          githubLogin: true,
          email: true,
          avatarUrl: true,
        },
      });

      if (dbUser) {
        user = dbUser;
      }
    }
  }

  if (!user) {
    const bearerToken = parseBearerToken(options.headers);
    if (bearerToken) {
      const hashedToken = createHash("sha256").update(bearerToken).digest("hex");
      const apiUser = await prisma.user.findUnique({
        where: { apiKey: hashedToken },
        select: {
          id: true,
          githubLogin: true,
          email: true,
          avatarUrl: true,
        },
      });

      if (apiUser) {
        user = apiUser;
      }
    }
  }

  return {
    user,
    headers: options.headers ?? null,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
