/**
 * BSV-specific Jest setup
 * Initializes BSV SDK mocks and test utilities
 */

import { jest } from '@jest/globals';

// Mock crypto.randomBytes for deterministic tests
Object.defineProperty(global, 'crypto', {
  value: {
    randomBytes: jest.fn((size: number) => {
      const buffer = Buffer.alloc(size);
      // Fill with deterministic test data
      for (let i = 0; i < size; i++) {
        buffer[i] = i % 256;
      }
      return buffer;
    }),
    getRandomValues: jest.fn((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = i % 256;
      }
      return array;
    }),
  },
});

// Mock WebRTC for torrent tests
Object.defineProperty(global, 'RTCPeerConnection', {
  value: class MockRTCPeerConnection {
    localDescription: any = null;
    remoteDescription: any = null;
    iceConnectionState = 'new';
    connectionState = 'new';

    constructor() {}
    createOffer() { return Promise.resolve({ type: 'offer', sdp: 'mock-sdp' }); }
    createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'mock-sdp' }); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  },
});

// Mock WebSocket for overlay services
Object.defineProperty(global, 'WebSocket', {
  value: class MockWebSocket {
    readyState = 1; // OPEN
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor(public url: string) {
      setTimeout(() => this.onopen?.(new Event('open')), 0);
    }

    send(data: string) {
      // Echo back for tests
      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', { data }));
      }, 0);
    }

    close() {
      setTimeout(() => this.onclose?.(new CloseEvent('close')), 0);
    }
  },
});

// Extend Jest matchers for BSV-specific assertions
expect.extend({
  toBeValidBSVAddress(received: string) {
    const isValid = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid BSV address`,
      pass: isValid,
    };
  },

  toBeValidTorrentHash(received: string) {
    const isValid = /^[a-fA-F0-9]{40}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid torrent hash`,
      pass: isValid,
    };
  },

  toBeValidTransactionId(received: string) {
    const isValid = /^[a-fA-F0-9]{64}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid transaction ID`,
      pass: isValid,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidBSVAddress(): R;
      toBeValidTorrentHash(): R;
      toBeValidTransactionId(): R;
    }
  }
}

console.log('🔧 BSV test environment configured');