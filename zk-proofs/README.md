# Wellness on the Block - Zero-Knowledge Proof System

This package provides zero-knowledge proof components for the Wellness on the Block platform, enabling privacy-preserving identity verification and anonymous session participation.

## Overview

The ZK proof system allows users to:
- Verify their identity without revealing personal information
- Participate in wellness sessions anonymously
- Prove age requirements without disclosing exact age
- Prevent double-spending/reuse through nullifiers

## Architecture

### Components

1. **Circuits** - Circom circuits for ZK-SNARK proofs
   - `identity.circom` - Identity verification circuit
   - `session.circom` - Session participation circuit  
   - `age.circom` - Age verification circuit

2. **Crypto Utils** - Cryptographic utilities and helpers
   - Hashing and encryption functions
   - Commitment generation
   - Nullifier management

3. **Proof Verifier** - Proof verification and validation
   - Cryptographic proof verification
   - Business logic validation
   - Nullifier reuse detection

## Installation

```bash
npm install
```

## Usage

### Basic Identity Verification

```typescript
import { ZKProofSystem } from 'wellness-zk-proofs';

const zkSystem = new ZKProofSystem();

// Generate identity proof
const result = await zkSystem.verifyIdentity(
  identitySecret,
  {
    age: 30,
    professionVerified: true,
    backgroundCheckPassed: true,
    licenseValid: true
  },
  'therapy'
);

console.log('Commitment:', result.commitment);
console.log('Verification:', result.verification);
```

### Anonymous Session Participation

```typescript
// Participate anonymously
const sessionResult = await zkSystem.participateAnonymously(
  identitySecret,
  commitment,
  'therapy'
);

console.log('Session verification:', sessionResult.verification);
```

### Age-Only Verification

```typescript
// Verify age without revealing it
const ageResult = await zkSystem.verifyAgeOnly(
  identitySecret,
  30,
  18 // minimum age
);

console.log('Age verification:', ageResult.verification);
```

## Development

### Building Circuits

```bash
# Compile all circuits
npm run build:circuits

# Compile individual circuits
npm run compile:circuits
npm run compile:session
npm run compile:age
```

### Setup Verification Keys

```bash
# Setup all keys
npm run setup:keys

# Setup individual keys
npm run setup:session-keys
npm run setup:age-keys
```

### Testing

```bash
# Generate test proofs
npm run generate-proof

# Verify test proofs
npm run verify-proof

# Run batch verification
npm run verify-proof batch

# Test nullifier reuse
npm run verify-proof nullifier

# Performance testing
npm run verify-proof performance 100
```

## Circuit Details

### Identity Verification Circuit

The identity circuit allows users to prove they meet certain criteria without revealing personal information:

**Inputs:**
- `identity_secret` - Secret known only to the user
- `age` - User's age
- `profession_verified` - Boolean for professional verification
- `background_check` - Boolean for background check status
- `license_valid` - Boolean for license validity
- `min_age` - Minimum age requirement
- `session_type` - Type of session

**Outputs:**
- `commitment` - Hash of identity attributes
- `nullifier` - Unique identifier to prevent reuse

### Session Participation Circuit

Allows anonymous participation in sessions using previously generated commitments:

**Inputs:**
- `identity_secret` - User's secret
- `commitment` - Previously generated commitment
- `session_type` - Type of session
- `timestamp` - Current timestamp

**Outputs:**
- `nullifier` - Session-specific nullifier

### Age Verification Circuit

Proves age requirements without revealing exact age:

**Inputs:**
- `identity_secret` - User's secret
- `age` - User's age
- `min_age` - Minimum age requirement

**Outputs:**
- `commitment` - Age commitment

## Security Considerations

1. **Identity Secret Protection**: Never expose the identity secret
2. **Nullifier Management**: Prevent nullifier reuse through proper tracking
3. **Proof Freshness**: Include timestamps to prevent replay attacks
4. **Commitment Binding**: Ensure commitments are properly bound to attributes

## Performance

- Proof generation: ~2-5 seconds on modern hardware
- Proof verification: ~100-200ms
- Memory usage: ~500MB during proof generation

## API Reference

### ZKProofSystem

Main class for ZK proof operations.

#### Methods

- `verifyIdentity(secret, attributes, sessionType)` - Complete identity verification
- `participateAnonymously(secret, commitment, sessionType)` - Anonymous participation
- `verifyAgeOnly(secret, age, minAge)` - Age-only verification
- `getVerifier()` - Get verifier instance
- `getIdentityCircuit()` - Get circuit instance

### CryptoUtils

Cryptographic utility functions.

#### Methods

- `generateIdentitySecret()` - Generate random identity secret
- `hashData(data)` - Hash data using SHA-256
- `encrypt(data, key)` - Encrypt sensitive data
- `decrypt(encryptedData, key)` - Decrypt sensitive data
- `generateCommitment(attributes)` - Generate deterministic commitment

### ProofVerifier

Proof verification and validation.

#### Methods

- `verifyIdentityProof(proof, signals)` - Verify identity proof
- `verifySessionProof(proof, signals, commitment)` - Verify session proof
- `verifyAgeProof(proof, signals, minAge)` - Verify age proof
- `isNullifierUsed(nullifier)` - Check if nullifier is used
- `batchVerifyProofs(proofs)` - Batch verify multiple proofs

## Testing

The package includes comprehensive testing scripts:

```bash
# Generate sample proofs for testing
npm run generate-proof

# Run all verification tests
npm run verify-proof

# Performance testing
npm run verify-proof performance 1000

# Batch testing
npm run generate-proof batch 50
npm run verify-proof batch
```

## Integration

### Frontend Integration

```typescript
import { ZKProofSystem } from 'wellness-zk-proofs';

// Initialize ZK system
const zkSystem = new ZKProofSystem();

// User registration with ZK proof
async function registerUser(userData) {
  const identitySecret = CryptoUtils.generateIdentitySecret();
  
  const result = await zkSystem.verifyIdentity(
    identitySecret,
    userData.attributes,
    'registration'
  );
  
  // Store commitment, discard secret
  await saveUserCommitment(result.commitment);
  
  return result;
}
```

### Backend Integration

```typescript
import { proofVerifier } from 'wellness-zk-proofs';

// Verify session participation
app.post('/api/session/join', async (req, res) => {
  const { proof, publicSignals } = req.body;
  
  const verification = await proofVerifier.verifySessionProof(
    proof,
    publicSignals
  );
  
  if (verification.isValid) {
    // Allow session participation
    res.json({ success: true, nullifier: verification.nullifier });
  } else {
    res.status(400).json({ error: verification.error });
  }
});
```

## Troubleshooting

### Common Issues

1. **Compilation Errors**: Ensure Circom and SnarkJS are properly installed
2. **Memory Issues**: Increase Node.js memory limit for large circuits
3. **Proof Generation Failures**: Check input formats and ranges

### Debug Mode

Enable debug logging:

```bash
DEBUG=zk-proofs:* npm run generate-proof
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: https://github.com/wellness-on-block/zk-proofs/issues
- Documentation: https://docs.wellnessonblock.com/zk-proofs
