# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **BSV Torrent** application - a Next.js 15 web application that combines BitTorrent functionality with Bitcoin SV (BSV) blockchain features. The project appears to be in early development with a foundational Next.js structure in place.

## Plan & Review Process

### Before starting work
- Always enter plan mode to create a detailed plan
- Write the plan to .claude/tasks/TASK_NAME.md
- Include detailed implementation steps, reasoning, and task breakdown
- Research latest package information if needed (use Task tool)
- Focus on MVP approach - avoid over-engineering
- Request user review before proceeding with implementation

### During implementation
- Update the plan as work progresses
- Document completed changes with detailed descriptions for handover
- Ask for clarification on any doubts or concerns
- Provide suggestions and feedback when appropriate

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack (opens at http://localhost:3000)
- `npm run build` - Build production application with Turbopack
- `npm start` - Start production server

### Code Quality
- `npm run lint` - Run ESLint (configured with Next.js TypeScript rules)
- `npm run test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

## Architecture & Structure

### Framework Stack
- **Next.js 15** with App Router (latest stable)
- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **Jest** with React Testing Library for testing
- **ESLint** with Next.js and TypeScript rules

### Key Dependencies
- **@bsv/sdk** - Bitcoin SV blockchain integration
- **webtorrent** - P2P file sharing capabilities
- **zustand** - Lightweight state management
- **bip32/bip39** - Bitcoin cryptographic utilities
- **Radix UI** + **class-variance-authority** - UI component system
- **lucide-react** - Icon library

### Directory Structure
```
app/                    # Next.js App Router pages and layouts
  globals.css          # Global Tailwind styles
  layout.tsx           # Root layout with Geist fonts
  page.tsx             # Home page (currently default Next.js)

bsv-torrent/           # Main application modules (currently empty directories)
  components/          # React components organized by feature
    ui/               # Reusable UI components
    dashboard/        # Dashboard-specific components
    torrent/          # Torrent functionality components
    wallet/           # BSV wallet components
  lib/                 # Core business logic
    payment/          # Payment processing
    bsv/              # BSV blockchain utilities
    torrent/          # Torrent management
  hooks/               # Custom React hooks
  services/            # External service integrations
  types/               # TypeScript type definitions
  __tests__/           # Test files
    unit/             # Unit tests
    integration/      # Integration tests
    e2e/              # End-to-end tests

lib/
  utils.ts             # Utility functions (currently cn() for className merging)
```

### Configuration
- **TypeScript**: Strict mode enabled with ES2017 target
- **Path Aliases**: `@/*` maps to root directory
- **ESLint**: Next.js core web vitals and TypeScript rules
- **Jest**: Configured for Next.js with jsdom environment and coverage collection
- **Module Resolution**: Uses bundler resolution for optimal Next.js compatibility

## Development Guidelines

### Project Context
This appears to be a hybrid application combining:
1. **P2P File Sharing** (WebTorrent) - Decentralized file distribution
2. **BSV Blockchain** - Payment processing and potentially file metadata/ownership
3. **Modern Web Stack** - Next.js for optimal performance and developer experience

### State Management
- Uses **Zustand** for client-side state
- Expect wallet state, torrent management, and UI state to be primary store concerns

### Testing Strategy
- Jest configuration includes coverage for `app/`, `components/`, and `lib/` directories
- Test structure supports unit, integration, and e2e testing patterns
- Use React Testing Library for component testing

### Styling Approach
- **Tailwind CSS v4** with utility-first approach
- Geist font family (sans and mono variants) loaded via next/font
- Component styling likely follows Radix UI + class-variance-authority patterns

### Development Notes
- The codebase structure suggests a feature-based organization within `bsv-torrent/`
- Empty directories indicate the project is in initial setup phase
- BSV integration will likely require careful handling of private keys and transaction management
- WebTorrent integration suggests browser-based P2P capabilities without requiring external torrent clients