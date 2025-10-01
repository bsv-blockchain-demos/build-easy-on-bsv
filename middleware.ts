/**
 * BSV Torrent Middleware
 *
 * This middleware ensures the server is properly initialized before handling requests.
 * It also handles server wallet initialization for API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeBSVTorrentServer } from './app/lib/server-init';

// Track initialization status with promise-based mutex
let initializationPromise: Promise<void> | null = null;

export async function middleware(request: NextRequest) {
  // Only initialize for API routes to avoid affecting static assets
  if (request.nextUrl.pathname.startsWith('/api/')) {
    try {
      // Ensure server is initialized before handling API requests
      // Use promise-based mutex to prevent race conditions
      if (!initializationPromise) {
        initializationPromise = initializeBSVTorrentServer().catch(error => {
          // Reset on failure to allow retry
          initializationPromise = null;
          throw error;
        });
      }
      await initializationPromise;

      // Add server-ready header
      const response = NextResponse.next();
      response.headers.set('X-BSV-Torrent-Server-Ready', 'true');
      return response;

    } catch (error) {
      console.error('[Middleware] Server initialization failed:', error);

      // Return error response for API routes
      return NextResponse.json(
        {
          success: false,
          error: 'Server initialization failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 503 }
      );
    }
  }

  // For non-API routes, proceed normally
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