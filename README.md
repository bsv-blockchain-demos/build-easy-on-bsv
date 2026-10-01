# BSV Torrent

A development prototype for combining peer-to-peer file sharing with BSV micropayments. This repository contains a Next.js dashboard, server and client wallet integrations, torrent libraries and payment-processing experiments.

## Current status

The application is incomplete. The dashboard's upload callback currently logs the selected file, and **Add Torrent** has no action handler. Peer discovery and event broadcasting in the application overlay manager use mock implementations.

The production build also fails because [torrent-wallet-manager.ts](bsv-torrent/lib/wallet/torrent-wallet-manager.ts) imports `@bsv/wallet-toolbox`, which is missing from the root package dependencies. These gaps need resolving before a complete file-sharing workflow can be demonstrated.

## Repository guide

| Location | Contents |
| --- | --- |
| [app/components/](app/components/) | Torrent dashboard, upload form, wallet controls and payment views. |
| [app/contexts/bsv-wallet-context.tsx](app/contexts/bsv-wallet-context.tsx) | Client wallet connection, deposits, withdrawals and balance refresh. |
| [lib/server/](lib/server/) | Application wallet service and initialisation. |
| [app/api/wallet/](app/api/wallet/) | Wallet balance, initialisation, payment and transaction routes. |
| [bsv-torrent/lib/](bsv-torrent/lib/) | Torrent client, payment scripts, wallet management, ARC and overlay modules. |
| [app/lib/bsv/](app/lib/bsv/) | Payment event batching and application overlay integration. |
| [app/stores/](app/stores/) | Dashboard state managed with Zustand. |
| [bsv-torrent/__tests__/](bsv-torrent/__tests__/) | Library tests and test support code. |
| [app/__tests__/performance/](app/__tests__/performance/) | Payment batching and performance tests. |

## Local development

Use Node.js 22 and npm. The locked native dependencies include `better-sqlite3`; Node.js 22 is within its supported version range.

```sh
git clone https://github.com/bsv-blockchain-demos/build-easy-on-bsv.git
cd build-easy-on-bsv
npm ci
```

Create a `.env.local` file using settings for your development wallet:

| Variable | Purpose |
| --- | --- |
| `SERVER_PRIVATE_KEY` | Hex-encoded private key for the server's application wallet. |
| `WALLET_STORAGE_URL` | Wallet storage service URL for that wallet. |
| `NEXT_PUBLIC_BSV_NETWORK` | Set to `testnet` for a development setup. Only the value `mainnet` selects the main chain in the application wallet service. |

Then start the development server:

```sh
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000`. Wallet API calls initialise the application wallet on demand. A compatible client wallet is needed for the deposit workflow.

The separate `/api/wallet/transaction` route reads `BSV_NETWORK` and `STORAGE_URL`. Those settings are distinct from the main application wallet settings above. Network and storage configuration need aligning when completing that route.

## Build and tests

```sh
npm run build
npm test
```

The current build stops at the missing wallet package described above. After resolving the build and implementation issues, `npm start` runs a successful production build. Additional scripts provide linting, test watch mode and coverage reporting.

The Jest configuration includes mocked WebTorrent behaviour and MongoDB test setup. Passing unit tests alone does not establish that live file transfers and payments work together.

## Deployment considerations

The repository includes [Docker configuration notes](DOCKER.md), Dockerfiles and Compose files for application, MongoDB and Redis services. Those files use configuration names that differ from the current application wallet code, so they need reconciliation before deployment.

Keep the prototype confined to a local development environment. The send-payment API currently has no caller authentication check, while the transaction route's signature verification remains a TODO. Add and verify access controls before exposing a funded application wallet.

## Licence

No licence file is currently included in this repository.
