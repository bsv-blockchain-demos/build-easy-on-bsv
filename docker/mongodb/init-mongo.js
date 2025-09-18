// MongoDB initialization script
// This runs when the MongoDB container is first created

// Switch to the bsv-torrent database
db = db.getSiblingDB('bsv-torrent');

// Create collections with indexes
db.createCollection('torrents');
db.torrents.createIndex({ infoHash: 1 }, { unique: true });
db.torrents.createIndex({ status: 1 });
db.torrents.createIndex({ createdAt: -1 });
db.torrents.createIndex({ 'metadata.tags': 1 });

db.createCollection('payments');
db.payments.createIndex({ txid: 1 }, { unique: true });
db.payments.createIndex({ torrentId: 1, peerId: 1 });
db.payments.createIndex({ status: 1 });
db.payments.createIndex({ createdAt: -1 });

db.createCollection('peers');
db.peers.createIndex({ peerId: 1 }, { unique: true });
db.peers.createIndex({ address: 1 });
db.peers.createIndex({ reputation: -1 });
db.peers.createIndex({ lastSeen: -1 });

db.createCollection('wallets');
db.wallets.createIndex({ address: 1 }, { unique: true });
db.wallets.createIndex({ userId: 1 });
db.wallets.createIndex({ createdAt: -1 });

db.createCollection('channels');
db.channels.createIndex({ channelId: 1 }, { unique: true });
db.channels.createIndex({ status: 1 });
db.channels.createIndex({ payerId: 1, payeeId: 1 });
db.channels.createIndex({ expiresAt: 1 });

db.createCollection('overlay_nodes');
db.overlay_nodes.createIndex({ nodeId: 1 }, { unique: true });
db.overlay_nodes.createIndex({ type: 1 });
db.overlay_nodes.createIndex({ lastPing: -1 });

// Create default admin user (for development)
db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ walletAddress: 1 });

db.users.insertOne({
  email: 'admin@bsv-torrent.local',
  role: 'admin',
  createdAt: new Date(),
  settings: {
    defaultPricePerChunk: 17,
    maxConcurrentDownloads: 10,
    maxConcurrentUploads: 20,
    enableAutoPay: true,
    enableAutoSeed: true
  }
});

print('BSV Torrent database initialized successfully!');