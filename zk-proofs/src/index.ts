// Main entry point for ZK proof system
export { IdentityCircuit, IDENTITY_CIRCUIT, SESSION_CIRCUIT, AGE_CIRCUIT } from './circuits/identity';
export { CryptoUtils, ZK_CONSTANTS } from './utils/crypto';
export { ProofVerifier, proofVerifier, VerificationResult, PublicSignals } from './verifier/proof-verifier';

// Re-export commonly used types and utilities
export type { 
  VerificationResult as ZKVerificationResult,
  PublicSignals as ZKPublicSignals 
} from './verifier/proof-verifier';

// Main ZK proof system class that combines all components
export class ZKProofSystem {
  private identityCircuit: IdentityCircuit;
  private verifier: ProofVerifier;

  constructor() {
    this.identityCircuit = new IdentityCircuit();
    this.verifier = proofVerifier;
  }

  // Complete identity verification flow
  async verifyIdentity(
    identitySecret: string,
    attributes: {
      age: number;
      professionVerified: boolean;
      backgroundCheckPassed: boolean;
      licenseValid: boolean;
    },
    sessionType: string
  ): Promise<{
    commitment: string;
    proof: import('./types').SnarkJsProof;
    publicSignals: string[];
    verification: VerificationResult;
  }> {
    // Generate proof
    const { proof, publicSignals } = await this.identityCircuit.generateProof(
      identitySecret,
      attributes,
      sessionType
    );

    // Verify proof
    const verification = await this.verifier.verifyIdentityProof(proof, publicSignals);

    // Extract commitment
    const signals = this.verifier.extractIdentitySignals(publicSignals);

    return {
      commitment: signals.commitment,
      proof,
      publicSignals,
      verification
    };
  }

  // Anonymous session participation
  async participateAnonymously(
    identitySecret: string,
    commitment: string,
    sessionType: string
  ): Promise<{
    proof: import('./types').SnarkJsProof;
    publicSignals: string[];
    verification: VerificationResult;
  }> {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Generate session proof
    const { proof, publicSignals } = await this.identityCircuit.generateSessionProof(
      identitySecret,
      commitment,
      sessionType,
      timestamp
    );

    // Verify proof
    const verification = await this.verifier.verifySessionProof(proof, publicSignals, commitment);

    return {
      proof,
      publicSignals,
      verification
    };
  }

  // Age verification without revealing exact age
  async verifyAgeOnly(
    identitySecret: string,
    age: number,
    minAge: number = 18
  ): Promise<{
    proof: import('./types').SnarkJsProof;
    publicSignals: string[];
    verification: VerificationResult;
  }> {
    // Generate age proof
    const { proof, publicSignals } = await this.identityCircuit.generateAgeProof(
      identitySecret,
      age,
      minAge
    );

    // Verify proof
    const verification = await this.verifier.verifyAgeProof(proof, publicSignals, minAge);

    return {
      proof,
      publicSignals,
      verification
    };
  }

  // Get verifier instance
  getVerifier(): ProofVerifier {
    return this.verifier;
  }

  // Get identity circuit instance
  getIdentityCircuit(): IdentityCircuit {
    return this.identityCircuit;
  }
}

// Factory function to create ZK proof system
export function createZKProofSystem(): ZKProofSystem {
  return new ZKProofSystem();
}

// Default export
export default ZKProofSystem;
