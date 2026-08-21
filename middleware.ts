import { NextRequest, NextResponse } from "next/server";

export const DESKTOP_SESSION_COOKIE = "teachhelper_desktop_session";
const DESKTOP_SESSION_HEADER = "x-teachhelper-desktop-token";

function isAuthorized(request: NextRequest, expectedToken: string) {
  return (
    request.cookies.get(DESKTOP_SESSION_COOKIE)?.value === expectedToken ||
    request.headers.get(DESKTOP_SESSION_HEADER) === expectedToken
  );
}

export function middleware(request: NextRequest) {
  const expectedToken = process.env.TEACHHELPER_DESKTOP_SESSION_TOKEN?.trim();

  if (!expectedToken || isAuthorized(request, expectedToken)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "desktop_session_required" }, { status: 401 });
  }

  return new NextResponse("TeachHelper desktop session required", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

export const config = {
  matcher: "/:path*"
};
