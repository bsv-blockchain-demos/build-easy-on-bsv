/**
 * BSV Torrent Middleware
 *
 * Simplified middleware - server initialization moved to API routes
 * to avoid Edge Runtime limitations with Node.js modules
 */

import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Middleware can be used for other purposes (auth, logging, rate limiting, etc.)
  // Server initialization is now handled at the API route level
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};