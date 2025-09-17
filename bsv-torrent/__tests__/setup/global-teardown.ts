/**
 * Global Jest teardown for BSV Torrent tests
 * Cleans up test database and services
 */

import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  // @ts-ignore - Global variable from setup
  const mongod: MongoMemoryServer = global.__MONGOD__;

  if (mongod) {
    await mongod.stop();
    console.log('🛑 MongoDB test server stopped');
  }

  // Clean up environment variables
  delete process.env.MONGODB_TEST_URI;
  delete process.env.BSV_NETWORK;
  delete process.env.ARC_API_KEY;
  delete process.env.TERANODE_URL;

  console.log('✅ BSV Torrent test environment cleaned up');
}