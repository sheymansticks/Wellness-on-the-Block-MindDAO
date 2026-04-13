# Wellness on the Block - Detailed Project Structure

## Directory Breakdown

### Frontend (`/frontend`)
```
frontend/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── common/          # Common components (Button, Modal, etc.)
│   │   ├── auth/            # Authentication components
│   │   ├── provider/        # Provider-related components
│   │   ├── session/         # Session management components
│   │   └── zk/              # Zero-knowledge proof components
│   ├── pages/               # Page components
│   │   ├── Home.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Providers.tsx
│   │   ├── Sessions.tsx
│   │   └── Profile.tsx
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useStellar.ts
│   │   ├── useZKProof.ts
│   │   └── useWebSocket.ts
│   ├── services/            # API and blockchain services
│   │   ├── api.ts
│   │   ├── stellar.ts
│   │   ├── zkProof.ts
│   │   └── websocket.ts
│   ├── store/               # State management
│   │   ├── index.ts
│   │   ├── authSlice.ts
│   │   ├── providerSlice.ts
│   │   └── sessionSlice.ts
│   ├── utils/               # Utility functions
│   │   ├── constants.ts
│   │   ├── helpers.ts
│   │   └── validation.ts
│   ├── types/               # TypeScript type definitions
│   │   ├── auth.ts
│   │   ├── provider.ts
│   │   ├── session.ts
│   │   └── stellar.ts
│   ├── App.tsx
│   └── index.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

### Backend (`/backend`)
```
backend/
├── src/
│   ├── controllers/         # Route controllers
│   │   ├── authController.ts
│   │   ├── providerController.ts
│   │   ├── sessionController.ts
│   │   ├── paymentController.ts
│   │   └── zkController.ts
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   ├── rateLimiter.ts
│   │   └── errorHandler.ts
│   ├── models/              # Database models
│   │   ├── User.ts
│   │   ├── Provider.ts
│   │   ├── Session.ts
│   │   ├── Payment.ts
│   │   └── Reputation.ts
│   ├── routes/              # API routes
│   │   ├── auth.ts
│   │   ├── providers.ts
│   │   ├── sessions.ts
│   │   ├── payments.ts
│   │   └── zk.ts
│   ├── services/            # Business logic services
│   │   ├── authService.ts
│   │   ├── providerService.ts
│   │   ├── sessionService.ts
│   │   ├── stellarService.ts
│   │   ├── zkProofService.ts
│   │   └── matchingService.ts
│   ├── config/              # Configuration files
│   │   ├── database.ts
│   │   ├── stellar.ts
│   │   ├── redis.ts
│   │   └── environment.ts
│   ├── utils/               # Utility functions
│   │   ├── logger.ts
│   │   ├── encryption.ts
│   │   ├── validation.ts
│   │   └── helpers.ts
│   ├── types/               # TypeScript types
│   │   ├── user.ts
│   │   ├── provider.ts
│   │   ├── session.ts
│   │   └── payment.ts
│   ├── app.ts               # Express app setup
│   └── server.ts            # Server entry point
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Database migrations
│   └── seed.ts              # Seed data
├── tests/                   # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Smart Contracts (`/smart-contracts`)
```
smart-contracts/
├── stellar/
│   ├── contracts/           # Stellar smart contracts
│   │   ├── PaymentEscrow.ts
│   │   ├── IdentityVerification.ts
│   │   ├── ReputationSystem.ts
│   │   ├── SessionManagement.ts
│   │   └── TokenDistribution.ts
│   ├── scripts/             # Deployment scripts
│   │   ├── deploy.ts
│   │   ├── upgrade.ts
│   │   └── verify.ts
│   ├── tests/               # Contract tests
│   │   ├── PaymentEscrow.test.ts
│   │   ├── IdentityVerification.test.ts
│   │   └── ReputationSystem.test.ts
│   ├── utils/               # Contract utilities
│   │   ├── helpers.ts
│   │   ├── constants.ts
│   │   └── types.ts
│   └── soroban-config.toml  # Soroban configuration
├── artifacts/               # Compiled contract artifacts
└── README.md
```

### Zero-Knowledge Proofs (`/zk-proofs`)
```
zk-proofs/
├── circuits/                # ZK-proof circuits
│   ├── identity/            # Identity verification circuits
│   │   ├── identity.circom
│   │   ├── identity.r1cs
│   │   └── identity.zkey
│   ├── session/             # Session privacy circuits
│   │   ├── session.circom
│   │   ├── session.r1cs
│   │   └── session.zkey
│   └── reputation/          # Reputation privacy circuits
│       ├── reputation.circom
│       ├── reputation.r1cs
│       └── reputation.zkey
├── scripts/                 # ZK-proof generation scripts
│   ├── compile.sh
│   ├── setup.sh
│   └── generate-proof.js
├── tests/                   # ZK-proof tests
├── utils/                   # ZK-proof utilities
│   ├── groth16.ts
│   ├── plonk.ts
│   └── verifier.ts
└── README.md
```

### Shared (`/shared`)
```
shared/
├── types/                   # Shared TypeScript types
│   ├── user.ts
│   ├── provider.ts
│   ├── session.ts
│   ├── payment.ts
│   └── stellar.ts
├── constants/               # Shared constants
│   ├── networks.ts
│   ├── errors.ts
│   └── events.ts
├── utils/                   # Shared utilities
│   ├── validation.ts
│   ├── encryption.ts
│   └── formatting.ts
└── package.json
```

### Documentation (`/docs`)
```
docs/
├── api/                     # API documentation
│   ├── auth.md
│   ├── providers.md
│   ├── sessions.md
│   └── payments.md
├── smart-contracts/         # Smart contract docs
│   ├── payment-escrow.md
│   ├── identity-verification.md
│   └── reputation-system.md
├── zk-proofs/              # ZK-proof documentation
│   ├── identity-proofs.md
│   ├── session-proofs.md
│   └── implementation-guide.md
├── deployment/             # Deployment guides
│   ├── stellar-deployment.md
│   ├── frontend-deployment.md
│   └── backend-deployment.md
├── security/               # Security documentation
│   ├── audit-reports.md
│   ├── threat-model.md
│   └── best-practices.md
└── user-guides/            # User documentation
    ├── patient-guide.md
    ├── provider-guide.md
    └── developer-guide.md
```

### Scripts (`/scripts`)
```
scripts/
├── setup/                  # Setup scripts
│   ├── install-deps.sh
│   ├── setup-database.sh
│   └── generate-keys.ts
├── deployment/             # Deployment scripts
│   ├── deploy-stellar.sh
│   ├── deploy-frontend.sh
│   └── deploy-backend.sh
├── testing/                # Testing scripts
│   ├── run-tests.sh
│   ├── integration-tests.sh
│   └── load-tests.sh
└── maintenance/            # Maintenance scripts
    ├── backup-db.sh
    ├── cleanup-logs.sh
    └── update-contracts.sh
```

### Docker (`/docker`)
```
docker/
├── frontend/
│   └── Dockerfile
├── backend/
│   └── Dockerfile
├── database/
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
└── docker-compose.prod.yml
```

## Key Components Overview

### 1. Frontend Components
- **Authentication**: Wallet-based auth with ZK-proof integration
- **Provider Discovery**: Search and filter therapists/counselors
- **Session Management**: Schedule, join, and manage sessions
- **Payment Interface**: Stellar wallet integration for payments
- **Privacy Dashboard**: ZK-proof status and privacy controls

### 2. Backend Services
- **User Management**: Registration, authentication, profiles
- **Provider Management**: Verification, scheduling, reputation
- **Session Service**: Video/audio session coordination
- **Payment Gateway**: Stellar transaction processing
- **ZK-Proof Service**: Proof generation and verification

### 3. Smart Contracts (Stellar)
- **Payment Escrow**: Secure fund holding and release
- **Identity Verification**: ZK-based identity proofs
- **Reputation System**: On-chain reputation tracking
- **Token Management**: Native token for platform economy

### 4. Zero-Knowledge Components
- **Identity Circuits**: Anonymous identity verification
- **Session Privacy**: Private session metadata
- **Reputation Privacy**: Private reputation scoring
- **Proof Verification**: On-chain and off-chain verification

## Data Flow

1. **User Registration**: ZK-proof generation → Stellar wallet creation → Profile setup
2. **Provider Discovery**: Filter providers → Verify credentials → Schedule session
3. **Session Execution**: Payment escrow → Session connection → Proof generation
4. **Payment Release**: Session completion → Reputation update → Fund release

## Security Architecture

- **Multi-layer Security**: ZK-proofs + encryption + smart contracts
- **Privacy by Design**: All sensitive data protected by ZK-proofs
- **Audit Trail**: On-chain transaction history
- **Access Control**: Role-based permissions
- **Data Protection**: End-to-end encryption for communications
