/**
 * Global Jest setup for BSV Torrent tests
 * Initializes test database and BSV services
 */

import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export default async function globalSetup(): Promise<void> {
  // Start in-memory MongoDB for testing
  mongod = await MongoMemoryServer.create({
    binary: {
      version: '6.0.0',
      downloadDir: './node_modules/.cache/mongodb-memory-server',
    },
    instance: {
      dbName: 'bsv-torrent-test',
      port: 27018,
    },
  });

  const uri = mongod.getUri();
  process.env.MONGODB_TEST_URI = uri;
  process.env.BSV_NETWORK = 'testnet';
  process.env.ARC_API_KEY = 'test-arc-key';
  process.env.TERANODE_URL = 'https://test.teranode.io';

  // @ts-ignore - Global variable for teardown
  global.__MONGOD__ = mongod;

  console.log('🚀 BSV Torrent test environment initialized');
  console.log(`📦 MongoDB URI: ${uri}`);
}