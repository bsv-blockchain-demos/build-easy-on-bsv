/**
 * Mock WebTorrent for testing
 * Provides a minimal interface that matches the real WebTorrent API
 */

export default class MockWebTorrent {
  torrents: any[] = [];
  downloadSpeed = 0;
  uploadSpeed = 0;
  progress = 0;

  private eventListeners: Map<string, Function[]> = new Map();

  add(torrentId: string, options?: any, callback?: Function): any {
    const mockTorrent = {
      infoHash: this.extractHashFromMagnet(torrentId),
      name: 'mock-torrent',
      length: 65536, // 64KB
      pieces: ['piece1', 'piece2', 'piece3', 'piece4'],
      downloaded: 0,
      progress: 0,
      numPeers: 0,
      on: jest.fn(),
      off: jest.fn(),
      addPeer: jest.fn(),
      remove: jest.fn(),
    };

    this.torrents.push(mockTorrent);

    if (callback) {
      setTimeout(() => callback(mockTorrent), 0);
    }

    return mockTorrent;
  }

  seed(input: any, options?: any, callback?: Function): any {
    const mockTorrent = {
      infoHash: this.generateMockHash(input),
      name: 'seeded-torrent',
      length: 32768, // 32KB
      pieces: ['piece1', 'piece2'],
      on: jest.fn(),
      off: jest.fn(),
      addPeer: jest.fn(),
      remove: jest.fn(),
    };

    this.torrents.push(mockTorrent);

    if (callback) {
      setTimeout(() => callback(mockTorrent), 0);
    }

    return mockTorrent;
  }

  on(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off(event: string, listener?: Function): void {
    if (listener) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    } else {
      this.eventListeners.delete(event);
    }
  }

  remove(torrentId: string, callback?: Function): void {
    const index = this.torrents.findIndex(t =>
      t.infoHash === torrentId || t.infoHash === this.extractHashFromMagnet(torrentId)
    );

    if (index > -1) {
      this.torrents.splice(index, 1);
    }

    if (callback) {
      setTimeout(callback, 0);
    }
  }

  destroy(callback?: Function): void {
    this.torrents = [];
    this.eventListeners.clear();

    if (callback) {
      setTimeout(callback, 0);
    }
  }

  private extractHashFromMagnet(magnetURI: string): string {
    if (magnetURI.startsWith('magnet:')) {
      const match = magnetURI.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
      return match ? match[1] : 'mock-hash-' + Date.now().toString(36);
    }
    return this.generateMockHash(magnetURI);
  }

  private generateMockHash(input: any): string {
    // Generate deterministic mock hash
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return Buffer.from(str).toString('hex').padEnd(40, '0').substring(0, 40);
  }
}