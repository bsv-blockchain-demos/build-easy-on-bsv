'use client';

import { io, Socket } from 'socket.io-client';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.isConnecting || (this.socket && this.socket.connected)) {
      return;
    }

    this.isConnecting = true;

    this.socket = io({
      path: '/api/socket',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Emit connection success event for any listeners
      this.emit('connection:status', { connected: true, socketId: this.socket?.id });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnecting = false;

      // Emit connection status event
      this.emit('connection:status', { connected: false, reason });
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      this.reconnectAttempts = 0;

      // Request state sync after reconnection
      this.requestStateSync();

      // Emit reconnection event
      this.emit('connection:status', { connected: true, reconnected: true });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`WebSocket reconnection attempt ${attemptNumber}`);
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      this.emit('connection:status', { connected: false, failed: true });
    });

    // Handle connection success from server
    this.socket.on('connection:success', (data) => {
      console.log('WebSocket connection confirmed:', data);
    });

    // Handle state sync responses
    this.socket.on('state:sync-response', (data) => {
      console.log('State sync received:', data);
      this.emit('state:synced', data);
    });

    this.socket.on('state:sync-error', (error) => {
      console.error('State sync error:', error);
      this.emit('state:sync-error', error);
    });
  }

  public on(event: string, callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public off(event: string, callback?: (data: any) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  public emit(event: string, data?: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Cannot emit event - socket not connected:', event);
    }
  }

  public subscribeTo(room: string, data?: any) {
    this.emit(`${room}:subscribe`, data);
  }

  public unsubscribeFrom(room: string, data?: any) {
    this.emit(`${room}:unsubscribe`, data);
  }

  public requestStateSync(data?: any) {
    this.emit('state:sync-request', data || {});
  }

  public isConnected(): boolean {
    return this.socket ? this.socket.connected : false;
  }

  public getConnectionStatus() {
    if (!this.socket) return 'disconnected';
    if (this.isConnecting) return 'connecting';
    if (this.socket.connected) return 'connected';
    return 'disconnected';
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Torrent-specific methods
  public subscribeToTorrent(torrentId: string) {
    this.subscribeTo('torrent', { torrentId });
  }

  public unsubscribeFromTorrent(torrentId: string) {
    this.unsubscribeFrom('torrent', { torrentId });
  }

  public startPeerDiscovery(torrentId: string) {
    this.emit('torrent:start-discovery', { torrentId });
  }

  // Payment-specific methods
  public subscribeToPayments() {
    this.subscribeTo('payments');
  }

  public unsubscribeFromPayments() {
    this.unsubscribeFrom('payments');
  }

  // Wallet-specific methods
  public subscribeToWallet() {
    this.subscribeTo('wallet');
  }

  public unsubscribeFromWallet() {
    this.unsubscribeFrom('wallet');
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}

export { WebSocketClient };