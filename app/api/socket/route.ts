import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

// Extend NextResponse to include socket server
declare global {
  var io: SocketIOServer | undefined;
}

export async function GET(req: NextRequest) {
  if (!global.io) {
    console.log('Initializing Socket.IO server...');

    // Create Socket.IO server
    const io = new SocketIOServer({
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'development'
          ? ['http://localhost:3000', 'http://localhost:3001']
          : false,
        methods: ['GET', 'POST'],
      },
    });

    global.io = io;

    // Handle connections
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Handle client disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });

      // Handle torrent-related events
      socket.on('torrent:start-discovery', (data) => {
        console.log('Starting peer discovery for torrent:', data.torrentId);
        // Trigger peer discovery via overlay services
        // This will be implemented when we add the overlay event manager
      });

      socket.on('torrent:subscribe', (data) => {
        console.log('Client subscribing to torrent updates:', data.torrentId);
        socket.join(`torrent:${data.torrentId}`);
      });

      socket.on('torrent:unsubscribe', (data) => {
        console.log('Client unsubscribing from torrent updates:', data.torrentId);
        socket.leave(`torrent:${data.torrentId}`);
      });

      // Handle payment-related events
      socket.on('payments:subscribe', (data) => {
        console.log('Client subscribing to payment updates');
        socket.join('payments');
      });

      socket.on('payments:unsubscribe', (data) => {
        console.log('Client unsubscribing from payment updates');
        socket.leave('payments');
      });

      // Handle wallet events
      socket.on('wallet:subscribe', (data) => {
        console.log('Client subscribing to wallet updates');
        socket.join('wallet');
      });

      socket.on('wallet:unsubscribe', (data) => {
        console.log('Client unsubscribing from wallet updates');
        socket.leave('wallet');
      });

      // Handle state sync requests (for reconnections)
      socket.on('state:sync-request', async (data) => {
        try {
          console.log('State sync requested for:', data);

          // TODO: Implement state sync when we have the data stores
          const currentState = {
            torrents: {},
            payments: {},
            wallet: {},
            timestamp: Date.now(),
          };

          socket.emit('state:sync-response', currentState);
        } catch (error) {
          console.error('State sync error:', error);
          socket.emit('state:sync-error', 'Failed to sync state');
        }
      });

      // Send initial connection success
      socket.emit('connection:success', {
        socketId: socket.id,
        timestamp: Date.now(),
      });
    });

    console.log('Socket.IO server initialized');
  }

  return NextResponse.json({ message: 'Socket.IO server is running' });
}

// Helper function to emit events to connected clients
export function emitToClients(event: string, data: any, room?: string) {
  if (global.io) {
    if (room) {
      global.io.to(room).emit(event, data);
    } else {
      global.io.emit(event, data);
    }
  }
}

// Helper function to emit wallet events
export function emitWalletEvent(event: string, data: any) {
  emitToClients(event, data, 'wallet');
}

// Helper function to emit torrent events
export function emitTorrentEvent(event: string, data: any, torrentId?: string) {
  if (torrentId) {
    emitToClients(event, data, `torrent:${torrentId}`);
  } else {
    emitToClients(event, data);
  }
}

// Helper function to emit payment events
export function emitPaymentEvent(event: string, data: any) {
  emitToClients(event, data, 'payments');
}