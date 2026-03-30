import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard'];
const AUTH_PAGES = ['/login', '/register'];

/**
 * Route protection middleware.
 * Checks for an in-memory access token via Authorization header
 * OR a session cookie. Redirects unauthenticated users to /login.
 *
 * Note: The access token is stored in memory (Zustand), so server-side
 * middleware cannot read it directly. We rely on a lightweight session
 * indicator cookie set at login to gate dashboard access, then validate
 * the real JWT in API route handlers.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = AUTH_PAGES.some((page) => pathname.startsWith(page));

  // A lightweight indicator cookie (non-HttpOnly, short-lived) shows the user is logged in.
  // The actual access token is in memory; the refresh token is in an HttpOnly cookie.
  const hasSessionIndicator = request.cookies.has('of_session');

  if (isProtected && !hasSessionIndicator) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSessionIndicator) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
