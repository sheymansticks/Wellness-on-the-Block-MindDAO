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

## License

MIT License - see LICENSE file for details.

## Contact

For inquiries, please contact us at team@wellnessontheblock.io
