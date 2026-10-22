import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bk_session";
// /api/tracking is called by the driver phone app, which authenticates with its own token.
const PUBLIC_PATHS = ["/login", "/offline", "/api/tracking"];

/**
 * Optimistic check only: send visitors without a session cookie to /login.
 * Real authorization happens in pages (getCurrentUser) and every Server Action (actionUser).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|downloads/|manifest.webmanifest|sw.js|robots.txt|offline).*)"],
};
