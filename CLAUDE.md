# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BSV Torrent** is a production-ready Next.js 15 web application that combines BitTorrent P2P file sharing functionality with Bitcoin SV (BSV) blockchain micropayments. The project implements a sophisticated payment infrastructure for torrent-based content distribution with real-time micropayments, reputation systems, and seeder incentives.

## Current Implementation Status

The application is **actively developed** with substantial features already implemented:

### Core Features Implemented
- **Full BSV Wallet Integration** using @bsv/sdk and wallet-toolbox-client
- **BRC-100 Compliant** wallet implementation for standardized BSV operations
- **Dual Wallet Architecture**:
  - Server-side application wallet (singleton pattern)
  - Client-side user wallet connections (browser extensions, mobile apps)
- **Advanced Payment Processing**:
  - Optimized payment event batching with adaptive tuning
  - Payment channels for streaming micropayments
  - Escrow transactions for premium content
  - Seeder incentive payments
- **Torrent-Specific Features**:
  - Torrent payment transactions
  - Reputation certificates for peers
  - Content encryption key derivation
  - Peer communication key management
- **Real-time Updates** via WebSocket integration
- **Docker Deployment** with MongoDB and Redis support

## Architecture & Structure

### Framework Stack
- **Next.js 15** with App Router (latest stable)
- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **Jest** with React Testing Library for testing
- **ESLint** with Next.js and TypeScript rules
- **Docker** for containerization

### Key Dependencies
- **@bsv/sdk** - Core Bitcoin SV SDK
- **@bsv/wallet-toolbox-client** - Full wallet functionality
- **webtorrent** - P2P file sharing capabilities
- **zustand** - Lightweight state management
- **bip32/bip39** - Bitcoin cryptographic utilities
- **socket.io** - Real-time communication
- **mongodb/redis** - Data persistence and caching
- **Radix UI** + **class-variance-authority** - UI component system
- **lucide-react** - Icon library

### Directory Structure
```
app/                         # Next.js App Router
  api/                      # API routes
    wallet/                 # Wallet API endpoints
      balance/             # Balance queries
      health/              # Health checks
      initialize/          # Wallet initialization
      payment-request/     # Payment request generation
      send-payment/        # Payment processing
      transaction/         # Transaction management
    socket/                # WebSocket endpoints
  components/              # React components
    payment/              # Payment UI components
    torrent/              # Torrent UI components
    wallet/               # Wallet UI components
  contexts/               # React contexts
    bsv-wallet-context.tsx # BSV wallet state management
  lib/                    # Application libraries
    bsv/                  # BSV utilities
      payment-event-batcher.ts           # Basic payment batching
      payment-event-batcher-optimized.ts # Adaptive payment batching
      overlay-event-manager.ts           # Overlay network events
    server-init.ts        # Server initialization
    websocket-client.ts   # WebSocket client
  providers/              # React providers
  stores/                 # Zustand stores

bsv-torrent/              # Core BSV-Torrent integration
  lib/
    arc/                  # ARC transaction broadcasting
      torrent-arc-service.ts
    bsv/                  # BSV utilities
      torrent-key-manager.ts
    micropayments/        # Micropayment management
      torrent-micropayment-manager.ts
    overlay/              # Overlay network integration
      torrent-overlay-service.ts
    scripts/              # BSV scripts
      torrent-payment-scripts.ts
      torrent-script-templates.ts
    torrent/              # Torrent client
      torrent-client.ts
    wallet/               # Wallet management
      torrent-wallet-manager.ts
  __tests__/              # Comprehensive test suite

lib/
  server/                 # Server-side utilities
    torrent-app-wallet-service.ts # Server wallet singleton
    wallet-startup.ts              # Wallet initialization
  utils.ts                # Utility functions

components/ui/            # Reusable UI components

docker/                   # Docker configuration
  mongodb/               # MongoDB initialization
```

## Key Implementation Details

### Server Wallet Architecture
The application uses a singleton pattern for the server wallet (`TorrentAppWalletService`) that:
- Manages application-wide BSV transactions
- Handles incoming micropayments from users
- Distributes earnings to content seeders
- Maintains wallet state across the application lifecycle

### Payment Processing
The `OptimizedPaymentEventBatcher` provides:
- Adaptive batching based on load (10-100 events per batch)
- Dynamic timeout adjustment (50-500ms)
- Performance monitoring and auto-tuning
- Memory-efficient queue management
- Latency tracking and optimization

### Wallet Management
The `TorrentWalletManager` implements:
- Payment channel creation and settlement
- Micropayment processing with authorization tokens
- Reputation certificate generation
- Seeder incentive distribution
- BRC-42 compliant key derivation for torrents

### Middleware & Initialization
- Server initialization via middleware for API routes
- Automatic wallet setup on first request
- Health check endpoints for monitoring
- WebSocket server for real-time updates

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack (http://localhost:3000)
- `npm run build` - Build production application
- `npm start` - Start production server

### Code Quality
- `npm run lint` - Run ESLint
- `npm run test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

### Docker Operations
- `docker-compose -f docker-compose.dev.yml up -d` - Start development environment
- `docker-compose -f docker-compose.prod.yml up -d` - Start production environment
- Access MongoDB Admin at http://localhost:8081
- Access Redis Admin at http://localhost:8082

## Environment Configuration

Required environment variables:
```
# BSV Configuration
SERVER_PRIVATE_KEY=<hex_private_key>
WALLET_STORAGE_URL=<storage_provider_url>
NEXT_PUBLIC_BSV_NETWORK=mainnet|testnet

# Optional Services
ARC_URL=<arc_service_url>
ARC_API_KEY=<arc_api_key>
OVERLAY_SERVICE_URL=<overlay_url>
```

## Testing Strategy
- **Unit Tests**: Core business logic and utilities
- **Integration Tests**: Wallet operations and API endpoints
- **Performance Tests**: Payment batching and micropayment scenarios
- **WebSocket Tests**: Real-time communication

## Known Issues & Improvements

### Current Issues
1. **Thread Safety**: Middleware initialization flag needs promise-based locking
2. **Error Handling**: Storage provider failures need explicit try-catch blocks
3. **Configuration Updates**: Active batch timers aren't updated when config changes
4. **Transaction History**: Currently returns placeholder data for timestamps

### Planned Improvements
- Implement retry logic for wallet initialization failures
- Add comprehensive logging for production debugging
- Enhance error recovery mechanisms
- Complete blockchain data integration for transaction history

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Implement proper error handling
- Add comprehensive type definitions
- Write tests for new features

### Security Considerations
- Never commit private keys or secrets
- Use environment variables for sensitive data
- Implement proper input validation
- Follow BSV best practices for key management
- Use BRC-42 for deterministic key derivation

### Performance Optimization
- Batch micropayments when possible
- Use adaptive tuning for high-frequency operations
- Implement proper caching strategies
- Monitor WebSocket connection health
- Optimize database queries

## Plan & Review Process

### Before starting work
- Always enter plan mode to create a detailed plan
- Write the plan to .claude/tasks/TASK_NAME.md
- Include detailed implementation steps and reasoning
- Research latest BSV standards if needed
- Focus on production-ready solutions

### During implementation
- Update the plan as work progresses
- Document changes with detailed descriptions
- Test thoroughly before committing
- Ensure backward compatibility
- Monitor performance implications

## Additional Resources
- BSV SDK Documentation
- BRC-100 Wallet Standard
- WebTorrent Documentation
- Next.js 15 Documentation
- Docker Deployment Guide (see DOCKER.md)