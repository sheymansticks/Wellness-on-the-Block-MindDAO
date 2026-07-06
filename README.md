# Wellness on the Block (MindDAO)

A decentralized mental health platform that connects users with certified therapists and peer counselors through instant crypto payments while ensuring complete privacy through zero-knowledge proofs.

## Vision

Making mental health support as accessible as opening an app — no paperwork, no judgment, no barriers. Our platform leverages blockchain technology and zero-knowledge proofs to create a secure, private, and accessible mental health ecosystem.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │  Stellar Network│
│   (React/Web3)  │◄──►│   (Node.js)     │◄──►│  (Smart Contracts)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────►│   Database      │◄─────────────┘
                        │  (PostgreSQL)   │
                        └─────────────────┘
```

## Key Features

- **Decentralized Payments**: Instant crypto payments via Stellar network
- **Privacy-First**: Zero-knowledge proofs for identity and session privacy
- **Dual Provider System**: Certified therapists and trained peer counselors
- **Smart Contract Integration**: Automated payment distribution and escrow
- **Reputation System**: On-chain reputation for providers
- **Secure Matching**: AI-powered provider-patient matching with privacy preservation

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Web3.js/Stellar SDK** for blockchain integration
- **Tailwind CSS** for styling
- **ZK-SNARKs** for privacy features
- **MetaMask/Stellar Wallet** integration

### Backend
- **Node.js** with Express
- **PostgreSQL** with Prisma ORM
- **JWT** for authentication
- **Stellar SDK** for blockchain operations
- **Socket.io** for real-time communication
- **ZK-proof verification** using circom/snarkjs

### Smart Contracts (Stellar)
- **Payment Escrow Contract**: Secure fund holding and release
- **Identity Verification Contract**: ZK-based identity verification
- **Reputation Contract**: On-chain reputation management
- **Session Management Contract**: Session scheduling and completion

### Infrastructure
- **Docker** for containerization
- **AWS/GCP** for cloud deployment
- **Redis** for caching and session management
- **IPFS** for decentralized storage

## Project Structure

```
wellness-on-the-block/
├── frontend/                 # React frontend application
├── backend/                  # Node.js API server
├── smart-contracts/          # Stellar smart contracts
├── zk-proofs/               # Zero-knowledge proof circuits
├── shared/                  # Shared types and utilities
├── docs/                    # Documentation
├── scripts/                 # Deployment and utility scripts
└── docker/                  # Docker configurations
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker & Docker Compose
- Stellar CLI
- Rust (for ZK-proof compilation)

### Installation

1. Clone the repository
2. Install dependencies across all packages
3. Set up environment variables
4. Deploy smart contracts
5. Run database migrations
6. Start development servers

## Security & Privacy

- **Zero-Knowledge Proofs**: Complete anonymity for users
- **End-to-End Encryption**: All communications encrypted
- **Multi-Sig Wallets**: Enhanced security for funds
- **Regular Audits**: Smart contract and security audits
- **Compliance**: HIPAA and GDPR compliant where applicable

## Roadmap

### Phase 1: MVP (Months 1-3)
- Basic platform functionality
- Stellar payment integration
- Simple provider matching
- Basic ZK-proof implementation

### Phase 2: Enhancement (Months 4-6)
- Advanced matching algorithms
- Mobile applications
- Enhanced ZK-proof features
- Reputation system

### Phase 3: Scaling (Months 7-9)
- Multi-chain support
- Advanced AI features
- Enterprise integrations
- Global expansion

## Contributing

We welcome contributions! Please see our contributing guidelines for more information.

### Development workflow

A pre-commit hook (via `husky` + `lint-staged`) runs `npm run lint` on any
package whose source files you've changed, so lint violations are caught
locally before they reach CI. The wrapped form (`sh -c 'cd <pkg> && npm run lint'`)
instead of bare `cd <pkg> && npm run lint` is required because lint-staged's
execa layer spawns the first token as a binary path; aliasing through `sh -c`
is what actually reaches the shell.

| Staged path                | Hook runs                                          |
| -------------------------- | -------------------------------------------------- |
| `backend/src/**/*.ts`      | `sh -c 'cd backend && npm run lint'`               |
| `frontend/**/*.{ts,tsx}`   | `sh -c 'cd frontend && npm run lint'`              |
| `zk-proofs/src/**/*.ts`    | `sh -c 'cd zk-proofs && npm run lint'`             |

Setup notes:

- After a fresh clone, run `npm install` at the **repo root** (not just
  inside `backend/`/`frontend/`/`zk-proofs/`) — the `prepare: husky`
  script wires `.husky/pre-commit` into git's hook path. Without the
  root install the hook is silently absent and lint drift will only
  surface in CI.
- The hook lives in `.husky/pre-commit`; `core.hooksPath` is auto-configured
  by `husky`, and the internal `.husky/_/` cache is gitignored.
- Each command is wrapped as `sh -c 'cd <pkg> && npm run lint'`. The
  wrapper is required: lint-staged's execa spawn layer treats the first
  token as a binary path, and `cd` isn't a binary.
- POSIX-only: the hook targets POSIX shells (`sh` must be on `PATH`).
  Linux and macOS work natively; Windows requires WSL or Git-Bash.
  Pure Git-for-Windows / PowerShell will lose the hook silently.
- Bypass with `git commit --no-verify` only when absolutely necessary.

## License

MIT License - see LICENSE file for details.

## Contact

For inquiries, please contact us at team@wellnessontheblock.io
