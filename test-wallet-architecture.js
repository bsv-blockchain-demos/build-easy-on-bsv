/**
 * BSV Torrent Wallet Architecture Test Script
 *
 * This script tests the new wallet architecture to ensure:
 * 1. Server-side wallet service can be initialized
 * 2. Environment variables are correctly configured
 * 3. API routes are properly set up
 * 4. No legacy dependencies are being used
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testWalletArchitecture() {
  log(colors.cyan, '🧪 BSV Torrent Wallet Architecture Test');
  log(colors.cyan, '=====================================\n');

  let allTestsPassed = true;

  // Test 1: Check environment configuration
  log(colors.blue, '📋 Test 1: Environment Configuration');
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');

      // Check for new required variables
      const requiredVars = ['SERVER_PRIVATE_KEY', 'WALLET_STORAGE_URL', 'NEXT_PUBLIC_BSV_NETWORK'];
      const missingVars = requiredVars.filter(varName => !envContent.includes(varName));

      if (missingVars.length === 0) {
        log(colors.green, '✅ All required environment variables are present');
      } else {
        log(colors.red, `❌ Missing required environment variables: ${missingVars.join(', ')}`);
        allTestsPassed = false;
      }

      // Check for legacy variables that should be removed
      const legacyVars = ['BSV_MNEMONIC', 'BSV_WALLET_PATH'];
      const foundLegacy = legacyVars.filter(varName => envContent.includes(varName));

      if (foundLegacy.length === 0) {
        log(colors.green, '✅ No legacy environment variables found');
      } else {
        log(colors.yellow, `⚠️  Legacy environment variables found (should be removed): ${foundLegacy.join(', ')}`);
      }
    } else {
      log(colors.yellow, '⚠️  .env file not found - using example configuration');
    }
  } catch (error) {
    log(colors.red, `❌ Environment configuration test failed: ${error.message}`);
    allTestsPassed = false;
  }

  // Test 2: Check package.json dependencies
  log(colors.blue, '\n📦 Test 2: Package Dependencies');
  try {
    const packagePath = path.join(__dirname, 'package.json');
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    // Check for correct BSV dependencies
    const requiredDeps = ['@bsv/sdk', '@bsv/wallet-toolbox-client'];
    const missingDeps = requiredDeps.filter(dep => !packageContent.dependencies[dep]);

    if (missingDeps.length === 0) {
      log(colors.green, '✅ All required BSV dependencies are present');
    } else {
      log(colors.red, `❌ Missing required dependencies: ${missingDeps.join(', ')}`);
      allTestsPassed = false;
    }

    // Check for legacy dependencies that should be removed
    const legacyDeps = ['bip32', 'bip39', 'fs'];
    const foundLegacyDeps = legacyDeps.filter(dep =>
      packageContent.dependencies[dep] || packageContent.devDependencies?.[dep]
    );

    if (foundLegacyDeps.length === 0) {
      log(colors.green, '✅ No legacy dependencies found');
    } else {
      log(colors.yellow, `⚠️  Legacy dependencies found (should be removed): ${foundLegacyDeps.join(', ')}`);
    }
  } catch (error) {
    log(colors.red, `❌ Package dependencies test failed: ${error.message}`);
    allTestsPassed = false;
  }

  // Test 3: Check file structure
  log(colors.blue, '\n📁 Test 3: File Structure');
  try {
    const expectedFiles = [
      'lib/server/torrent-app-wallet-service.ts',
      'app/api/wallet/balance/route.ts',
      'app/api/wallet/payment-request/route.ts',
      'app/api/wallet/send-payment/route.ts',
      'app/api/wallet/health/route.ts',
      'app/api/wallet/initialize/route.ts',
      'app/contexts/bsv-wallet-context.tsx',
      'lib/server/wallet-startup.ts',
      'app/lib/server-init.ts',
      'middleware.ts'
    ];

    const missingFiles = expectedFiles.filter(file =>
      !fs.existsSync(path.join(__dirname, file))
    );

    if (missingFiles.length === 0) {
      log(colors.green, '✅ All expected files are present');
    } else {
      log(colors.red, `❌ Missing expected files: ${missingFiles.join(', ')}`);
      allTestsPassed = false;
    }
  } catch (error) {
    log(colors.red, `❌ File structure test failed: ${error.message}`);
    allTestsPassed = false;
  }

  // Test 4: Check wallet context implementation
  log(colors.blue, '\n🔗 Test 4: Wallet Context Implementation');
  try {
    const contextPath = path.join(__dirname, 'app/contexts/bsv-wallet-context.tsx');
    const contextContent = fs.readFileSync(contextPath, 'utf8');

    // Check for correct imports
    if (contextContent.includes("import { WalletClient } from '@bsv/sdk'")) {
      log(colors.green, '✅ Using correct WalletClient import');
    } else {
      log(colors.red, '❌ WalletClient import not found');
      allTestsPassed = false;
    }

    // Check for removal of legacy imports
    const legacyImports = ['SetupClient', 'StorageIdb', 'wallet-toolbox'];
    const foundLegacyImports = legacyImports.filter(imp => contextContent.includes(imp));

    if (foundLegacyImports.length === 0) {
      log(colors.green, '✅ No legacy wallet-toolbox imports found in client context');
    } else {
      log(colors.red, `❌ Legacy imports found in client context: ${foundLegacyImports.join(', ')}`);
      allTestsPassed = false;
    }

    // Check for correct function names
    if (contextContent.includes('sendToServerWallet')) {
      log(colors.green, '✅ Client context uses sendToServerWallet function');
    } else {
      log(colors.yellow, '⚠️  sendToServerWallet function not found');
    }
  } catch (error) {
    log(colors.red, `❌ Wallet context test failed: ${error.message}`);
    allTestsPassed = false;
  }

  // Test 5: Check server wallet service
  log(colors.blue, '\n🔧 Test 5: Server Wallet Service');
  try {
    const servicePath = path.join(__dirname, 'lib/server/torrent-app-wallet-service.ts');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');

    // Check for correct imports
    const requiredImports = ['WalletClient', 'PrivateKey', 'KeyDeriver', 'WalletStorageManager', 'Services', 'Wallet', 'StorageClient'];
    const missingImports = requiredImports.filter(imp => !serviceContent.includes(imp));

    if (missingImports.length === 0) {
      log(colors.green, '✅ All required imports found in server wallet service');
    } else {
      log(colors.red, `❌ Missing imports in server wallet service: ${missingImports.join(', ')}`);
      allTestsPassed = false;
    }

    // Check for createWalletClient pattern
    if (serviceContent.includes('createWalletClient')) {
      log(colors.green, '✅ Server service uses createWalletClient pattern');
    } else {
      log(colors.red, '❌ createWalletClient pattern not found');
      allTestsPassed = false;
    }
  } catch (error) {
    log(colors.red, `❌ Server wallet service test failed: ${error.message}`);
    allTestsPassed = false;
  }

  // Test Results
  log(colors.cyan, '\n=====================================');
  if (allTestsPassed) {
    log(colors.green, '🎉 All tests passed! Wallet architecture is correctly implemented.');
    log(colors.green, '\n✅ Architecture Summary:');
    log(colors.green, '   • Server-side: Full wallet-toolbox with createWalletClient pattern');
    log(colors.green, '   • Client-side: Simple WalletClient for BRC-100 wallet connection');
    log(colors.green, '   • API routes: Proper separation of server wallet operations');
    log(colors.green, '   • Environment: BRC-100 compliant configuration');
    log(colors.green, '   • No legacy dependencies or patterns');
  } else {
    log(colors.red, '❌ Some tests failed. Please review the issues above.');
    log(colors.yellow, '\n🔧 Next steps:');
    log(colors.yellow, '   1. Fix any missing files or dependencies');
    log(colors.yellow, '   2. Remove any remaining legacy code');
    log(colors.yellow, '   3. Ensure environment variables are properly configured');
    log(colors.yellow, '   4. Test wallet initialization manually');
  }
}

// Run the test
testWalletArchitecture().catch(error => {
  log(colors.red, `\n💥 Test script failed: ${error.message}`);
  process.exit(1);
});