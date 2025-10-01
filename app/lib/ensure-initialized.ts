/**
 * Server Initialization Helper for API Routes
 *
 * Provides a utility to ensure the server is initialized before handling requests.
 * Used by API routes instead of middleware to avoid Edge Runtime limitations.
 */

import { initializeBSVTorrentServer } from './server-init';

/**
 * Ensures the BSV Torrent server is initialized
 * Safe to call multiple times - uses internal promise mutex
 *
 * Usage in API routes:
 * ```typescript
 * export async function GET() {
 *   await ensureServerInitialized();
 *   // ... handle request
 * }
 * ```
 */
export async function ensureServerInitialized(): Promise<void> {
  await initializeBSVTorrentServer();
}

/**
 * Higher-order function to wrap API route handlers with initialization
 *
 * Usage:
 * ```typescript
 * export const GET = withServerInit(async () => {
 *   // Server is guaranteed to be initialized here
 *   return Response.json({ ... });
 * });
 * ```
 */
export function withServerInit<T extends (...args: any[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    try {
      await ensureServerInitialized();
      return await handler(...args);
    } catch (error) {
      console.error('[API] Server initialization failed:', error);
      return Response.json(
        {
          success: false,
          error: 'Server initialization failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 503 }
      );
    }
  }) as T;
}