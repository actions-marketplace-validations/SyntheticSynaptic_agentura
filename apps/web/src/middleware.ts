import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

function isProtectedPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isAuthCallbackPath(pathname: string) {
  return pathname === "/auth/callback";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, session } = await updateSession(request);

  if (isApiPath(pathname) || isAuthCallbackPath(pathname)) {
    return response;
  }

  if (isProtectedPath(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
