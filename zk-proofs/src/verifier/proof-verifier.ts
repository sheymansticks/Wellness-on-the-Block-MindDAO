import { groth16 } from 'snarkjs';
import { ethers } from 'ethers';
import { CryptoUtils } from '../utils/crypto';
import { ZK_CONSTANTS } from '../utils/crypto';

// Verification result interface
export interface VerificationResult {
  isValid: boolean;
  commitment?: string;
  nullifier?: string;
  timestamp?: string;
  error?: string;
}

// Public signals extracted from proof
export interface PublicSignals {
  commitment: string;
  nullifier: string;
  sessionType?: string;
  timestamp?: string;
  age?: string;
  minAge?: string;
}

// Main proof verifier class
export class ProofVerifier {
  private verificationKeys: Map<string, any> = new Map();
  private usedNullifiers: Set<string> = new Set();

  constructor() {
    this.initializeVerificationKeys();
  }

  // Initialize verification keys for different circuits
  private async initializeVerificationKeys(): Promise<void> {
    try {
      // Load identity verification key
      const identityKey = await this.loadVerificationKey('identity');
      this.verificationKeys.set('identity', identityKey);

      // Load session verification key
      const sessionKey = await this.loadVerificationKey('session');
      this.verificationKeys.set('session', sessionKey);

      // Load age verification key
      const ageKey = await this.loadVerificationKey('age');
      this.verificationKeys.set('age', ageKey);
    } catch (error) {
      console.error('Failed to initialize verification keys:', error);
    }
  }

  // Load verification key from file or API
  private async loadVerificationKey(circuitType: string): Promise<any> {
    try {
      const response = await fetch(`/circuits/${circuitType}_verification_key.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${circuitType} verification key`);
      }
      return await response.json();
    } catch (error) {
      // Fallback to embedded verification key
      return this.getEmbeddedVerificationKey(circuitType);
    }
  }

  // Embedded verification keys (fallback)
  private getEmbeddedVerificationKey(circuitType: string): any {
    // These would be the actual verification keys from circuit compilation
    const keys: Record<string, any> = {
      identity: {
        vk_alpha_1: ['1', '0', '0'],
        vk_beta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_gamma_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_delta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        IC: [['0', '0']]
      },
      session: {
        vk_alpha_1: ['1', '0', '0'],
        vk_beta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_gamma_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_delta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        IC: [['0', '0']]
      },
      age: {
        vk_alpha_1: ['1', '0', '0'],
        vk_beta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_gamma_2: [
          ['1', '0'],
          ['0', '1']
        ],
        vk_delta_2: [
          ['1', '0'],
          ['0', '1']
        ],
        IC: [['0', '0']]
      }
    };

    return keys[circuitType];
  }

  // Verify identity proof
  async verifyIdentityProof(
    proof: any,
    publicSignals: string[]
  ): Promise<VerificationResult> {
    try {
      const verificationKey = this.verificationKeys.get('identity');
      if (!verificationKey) {
        return { isValid: false, error: 'Identity verification key not loaded' };
      }

      // Verify the cryptographic proof
      const isValidCryptographicProof = await groth16.verify(
        verificationKey,
        publicSignals,
        proof
      );

      if (!isValidCryptographicProof) {
        return { isValid: false, error: 'Cryptographic proof verification failed' };
      }

      // Extract and validate public signals
      const signals = this.extractIdentitySignals(publicSignals);
      
      // Check if nullifier has been used before (prevent double-spending)
      if (this.usedNullifiers.has(signals.nullifier)) {
        return { isValid: false, error: 'Nullifier already used' };
      }

      // Validate timestamp (proof should be recent)
      const currentTime = Math.floor(Date.now() / 1000);
      const proofTime = parseInt(signals.timestamp);
      const timeDiff = Math.abs(currentTime - proofTime);
      
      if (timeDiff > 3600) { // 1 hour window
        return { isValid: false, error: 'Proof timestamp too old' };
      }

      // Mark nullifier as used
      this.usedNullifiers.add(signals.nullifier);

      return {
        isValid: true,
        commitment: signals.commitment,
        nullifier: signals.nullifier,
        timestamp: signals.timestamp
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Identity proof verification error: ${error}`
      };
    }
  }

  // Verify session participation proof
  async verifySessionProof(
    proof: any,
    publicSignals: string[],
    expectedCommitment?: string
  ): Promise<VerificationResult> {
    try {
      const verificationKey = this.verificationKeys.get('session');
      if (!verificationKey) {
        return { isValid: false, error: 'Session verification key not loaded' };
      }

      // Verify the cryptographic proof
      const isValidCryptographicProof = await groth16.verify(
        verificationKey,
        publicSignals,
        proof
      );

      if (!isValidCryptographicProof) {
        return { isValid: false, error: 'Cryptographic proof verification failed' };
      }

      // Extract public signals
      const signals = this.extractSessionSignals(publicSignals);

      // Check if commitment matches expected (if provided)
      if (expectedCommitment && signals.commitment !== expectedCommitment) {
        return { isValid: false, error: 'Commitment mismatch' };
      }

      // Check if nullifier has been used before
      if (this.usedNullifiers.has(signals.nullifier)) {
        return { isValid: false, error: 'Nullifier already used' };
      }

      // Validate session type
      const validSessionTypes = Object.values(ZK_CONSTANTS.SESSION_TYPES);
      const sessionTypeHash = ethers.utils.keccak256(signals.sessionType || '');
      const isValidSessionType = validSessionTypes.some(type => 
        ethers.utils.keccak256(type) === sessionTypeHash
      );

      if (!isValidSessionType) {
        return { isValid: false, error: 'Invalid session type' };
      }

      // Mark nullifier as used
      this.usedNullifiers.add(signals.nullifier);

      return {
        isValid: true,
        commitment: signals.commitment,
        nullifier: signals.nullifier,
        timestamp: signals.timestamp
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Session proof verification error: ${error}`
      };
    }
  }

  // Verify age proof
  async verifyAgeProof(
    proof: any,
    publicSignals: string[],
    minAge: number = ZK_CONSTANTS.MIN_AGE
  ): Promise<VerificationResult> {
    try {
      const verificationKey = this.verificationKeys.get('age');
      if (!verificationKey) {
        return { isValid: false, error: 'Age verification key not loaded' };
      }

      // Verify the cryptographic proof
      const isValidCryptographicProof = await groth16.verify(
        verificationKey,
        publicSignals,
        proof
      );

      if (!isValidCryptographicProof) {
        return { isValid: false, error: 'Cryptographic proof verification failed' };
      }

      // Extract public signals
      const signals = this.extractAgeSignals(publicSignals);

      // Verify minimum age requirement
      const proofMinAge = parseInt(signals.minAge);
      if (proofMinAge < minAge) {
        return { isValid: false, error: 'Age requirement not met' };
      }

      return {
        isValid: true,
        commitment: signals.commitment
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Age proof verification error: ${error}`
      };
    }
  }

  // Extract identity signals from public signals array
  private extractIdentitySignals(publicSignals: string[]): PublicSignals {
    // Expected order: commitment, nullifier, sessionType, timestamp
    return {
      commitment: publicSignals[0] || '',
      nullifier: publicSignals[1] || '',
      sessionType: publicSignals[2] || '',
      timestamp: publicSignals[3] || ''
    };
  }

  // Extract session signals from public signals array
  private extractSessionSignals(publicSignals: string[]): PublicSignals {
    // Expected order: commitment, nullifier, sessionType, timestamp
    return {
      commitment: publicSignals[0] || '',
      nullifier: publicSignals[1] || '',
      sessionType: publicSignals[2] || '',
      timestamp: publicSignals[3] || ''
    };
  }

  // Extract age signals from public signals array
  private extractAgeSignals(publicSignals: string[]): PublicSignals {
    // Expected order: commitment, age, minAge
    return {
      commitment: publicSignals[0] || '',
      age: publicSignals[1] || '',
      minAge: publicSignals[2] || ''
    };
  }

  // Check if nullifier has been used
  isNullifierUsed(nullifier: string): boolean {
    return this.usedNullifiers.has(nullifier);
  }

  // Add nullifier to used list
  addUsedNullifier(nullifier: string): void {
    this.usedNullifiers.add(nullifier);
  }

  // Clear used nullifiers (for testing or reset)
  clearUsedNullifiers(): void {
    this.usedNullifiers.clear();
  }

  // Get count of used nullifiers
  getUsedNullifierCount(): number {
    return this.usedNullifiers.size;
  }

  // Batch verify multiple proofs
  async batchVerifyProofs(
    proofs: Array<{
      type: 'identity' | 'session' | 'age';
      proof: any;
      publicSignals: string[];
      expectedCommitment?: string;
      minAge?: number;
    }>
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (const { type, proof, publicSignals, expectedCommitment, minAge } of proofs) {
      let result: VerificationResult;

      switch (type) {
        case 'identity':
          result = await this.verifyIdentityProof(proof, publicSignals);
          break;
        case 'session':
          result = await this.verifySessionProof(proof, publicSignals, expectedCommitment);
          break;
        case 'age':
          result = await this.verifyAgeProof(proof, publicSignals, minAge);
          break;
        default:
          result = { isValid: false, error: 'Unknown proof type' };
      }

      results.push(result);
    }

    return results;
  }

  // Verify proof with additional business logic validation
  async verifyProofWithBusinessRules(
    type: 'identity' | 'session' | 'age',
    proof: any,
    publicSignals: string[],
    options: {
      expectedCommitment?: string;
      minAge?: number;
      maxAge?: number;
      allowedSessionTypes?: string[];
      timeWindow?: number; // in seconds
    } = {}
  ): Promise<VerificationResult> {
    // First perform cryptographic verification
    let baseResult: VerificationResult;
    
    switch (type) {
      case 'identity':
        baseResult = await this.verifyIdentityProof(proof, publicSignals);
        break;
      case 'session':
        baseResult = await this.verifySessionProof(proof, publicSignals, options.expectedCommitment);
        break;
      case 'age':
        baseResult = await this.verifyAgeProof(proof, publicSignals, options.minAge);
        break;
      default:
        return { isValid: false, error: 'Unknown proof type' };
    }

    if (!baseResult.isValid) {
      return baseResult;
    }

    // Apply additional business rules
    return this.applyBusinessRules(baseResult, type, options);
  }

  // Apply business logic validation
  private applyBusinessRules(
    result: VerificationResult,
    type: string,
    options: any
  ): VerificationResult {
    // Add business-specific validation logic here
    // For now, just return the base result
    return result;
  }

  // Export used nullifiers for persistence
  exportUsedNullifiers(): string[] {
    return Array.from(this.usedNullifiers);
  }

  // Import used nullifiers from persistence
  importUsedNullifiers(nullifiers: string[]): void {
    this.usedNullifiers = new Set(nullifiers);
  }
}

// Singleton instance for global use
export const proofVerifier = new ProofVerifier();
