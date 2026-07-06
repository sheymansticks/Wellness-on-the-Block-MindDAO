import { Circuit, groth16 } from 'snarkjs';
import { buildMimcSponge } from 'circomlib';
import { ethers } from 'ethers';
import type { SnarkJsProof, SnarkJsVerificationKey } from '../types';

// Identity verification circuit using zk-SNARKs
export class IdentityCircuit {
  private mimc: ReturnType<typeof buildMimcSponge>;
  private circuit: Circuit;
  private wasmPath: string;
  private zkeyPath: string;

  constructor() {
    this.mimc = buildMimcSponge();
    this.wasmPath = '/circuits/identity.wasm';
    this.zkeyPath = '/circuits/identity.zkey';
  }

  // Generate identity commitment (hash of identity attributes)
  generateIdentityCommitment(
    identitySecret: string,
    attributes: {
      age: number;
      professionVerified: boolean;
      backgroundCheckPassed: boolean;
      licenseValid: boolean;
    }
  ): string {
    const inputs = {
      identity_secret: ethers.BigNumber.from(identitySecret),
      age: ethers.BigNumber.from(attributes.age),
      profession_verified: ethers.BigNumber.from(attributes.professionVerified ? 1 : 0),
      background_check: ethers.BigNumber.from(attributes.backgroundCheckPassed ? 1 : 0),
      license_valid: ethers.BigNumber.from(attributes.licenseValid ? 1 : 0),
    };

    const hash = this.mimc.F(
      ethers.BigNumber.from(inputs.identity_secret),
      ethers.BigNumber.from(inputs.age)
    );

    const finalHash = this.mimc.F(hash, ethers.BigNumber.from(
      inputs.profession_verified + inputs.background_check + inputs.license_valid
    ));

    return finalHash.toString();
  }

  // Generate nullifier for preventing double-spending/reuse
  generateNullifier(identitySecret: string, sessionType: string): string {
    const nullifierInput = ethers.BigNumber.from(
      ethers.utils.keccak256(ethers.utils.solidityPack(
        ['uint256', 'string'],
        [identitySecret, sessionType]
      ))
    );

    return this.mimc.F(nullifierInput, ethers.BigNumber.from(0)).toString();
  }

  // Generate zk-proof for identity verification
  async generateProof(
    identitySecret: string,
    attributes: {
      age: number;
      professionVerified: boolean;
      backgroundCheckPassed: boolean;
      licenseValid: boolean;
    },
    sessionType: string,
    minAge: number = 18
  ): Promise<{
    proof: SnarkJsProof;
    publicSignals: string[];
  }> {
    const commitment = this.generateIdentityCommitment(identitySecret, attributes);
    const nullifier = this.generateNullifier(identitySecret, sessionType);

    const circuitInputs = {
      identity_secret: ethers.BigNumber.from(identitySecret),
      age: ethers.BigNumber.from(attributes.age),
      profession_verified: ethers.BigNumber.from(attributes.professionVerified ? 1 : 0),
      background_check: ethers.BigNumber.from(attributes.backgroundCheckPassed ? 1 : 0),
      license_valid: ethers.BigNumber.from(attributes.licenseValid ? 1 : 0),
      min_age: ethers.BigNumber.from(minAge),
      session_type: ethers.BigNumber.from(ethers.utils.keccak256(sessionType)),
      commitment: ethers.BigNumber.from(commitment),
      nullifier: ethers.BigNumber.from(nullifier),
    };

    try {
      const { proof, publicSignals } = await groth16.fullProve(
        circuitInputs,
        this.wasmPath,
        this.zkeyPath
      );

      return { proof, publicSignals };
    } catch (error) {
      throw new Error(`Failed to generate proof: ${error}`);
    }
  }

  // Verify zk-proof
  async verifyProof(
    proof: SnarkJsProof,
    publicSignals: string[],
    verificationKey?: SnarkJsVerificationKey
  ): Promise<boolean> {
    try {
      const vKey = verificationKey || await this.loadVerificationKey();
      const verified = await groth16.verify(vKey, publicSignals, proof);
      return verified;
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }

  // Load verification key
  private async loadVerificationKey(): Promise<SnarkJsVerificationKey> {
    try {
      return (await fetch('/circuits/verification_key.json').then(res => res.json())) as SnarkJsVerificationKey;
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error}`);
    }
  }

  // Generate proof for anonymous session participation
  async generateSessionProof(
    identitySecret: string,
    commitment: string,
    sessionType: string,
    timestamp: number
  ): Promise<{
    proof: SnarkJsProof;
    publicSignals: string[];
  }> {
    const nullifier = this.generateNullifier(identitySecret, sessionType);

    const circuitInputs = {
      identity_secret: ethers.BigNumber.from(identitySecret),
      commitment: ethers.BigNumber.from(commitment),
      session_type: ethers.BigNumber.from(ethers.utils.keccak256(sessionType)),
      timestamp: ethers.BigNumber.from(timestamp),
      nullifier: ethers.BigNumber.from(nullifier),
    };

    try {
      const { proof, publicSignals } = await groth16.fullProve(
        circuitInputs,
        '/circuits/session.wasm',
        '/circuits/session.zkey'
      );

      return { proof, publicSignals };
    } catch (error) {
      throw new Error(`Failed to generate session proof: ${error}`);
    }
  }

  // Extract public signals from proof
  extractPublicSignals(proofData: { proof: SnarkJsProof; publicSignals: string[] }): {
    commitment: string;
    nullifier: string;
    sessionType: string;
    timestamp: string;
  } {
    const [commitment, nullifier, sessionType, timestamp] = proofData.publicSignals;
    
    return {
      commitment,
      nullifier,
      sessionType,
      timestamp
    };
  }

  // Generate age verification proof (without revealing exact age)
  async generateAgeProof(
    identitySecret: string,
    age: number,
    minAge: number
  ): Promise<{
    proof: SnarkJsProof;
    publicSignals: string[];
  }> {
    const commitment = this.generateIdentityCommitment(identitySecret, {
      age,
      professionVerified: false,
      backgroundCheckPassed: false,
      licenseValid: false
    });

    const circuitInputs = {
      identity_secret: ethers.BigNumber.from(identitySecret),
      age: ethers.BigNumber.from(age),
      min_age: ethers.BigNumber.from(minAge),
      commitment: ethers.BigNumber.from(commitment),
    };

    try {
      const { proof, publicSignals } = await groth16.fullProve(
        circuitInputs,
        '/circuits/age.wasm',
        '/circuits/age.zkey'
      );

      return { proof, publicSignals };
    } catch (error) {
      throw new Error(`Failed to generate age proof: ${error}`);
    }
  }
}

// Circuit definition for identity verification
export const IDENTITY_CIRCUIT = `
pragma circom 2.0.0;

include "circomlib/mimc.circom";
include "circomlib/comparators.circom";

template IdentityVerification() {
    signal input identity_secret;
    signal input age;
    signal input profession_verified;
    signal input background_check;
    signal input license_valid;
    signal input min_age;
    signal input session_type;
    signal output commitment;
    signal output nullifier;
    
    component mimc = MiMCSponge(1, 220, 1);
    component ageCheck = GreaterEqThan(8);
    
    // Calculate commitment
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== age;
    mimc.in[2] <== profession_verified + background_check + license_valid;
    commitment <== mimc.out[0];
    
    // Age verification
    ageCheck.in[0] <== age;
    ageCheck.in[1] <== min_age;
    
    // Generate nullifier
    component nullifierMimc = MiMCSponge(1, 220, 1);
    nullifierMimc.ins[0] <== identity_secret;
    nullifierMimc.ins[1] <== session_type;
    nullifier <== nullifierMimc.out[0];
    
    // Ensure age requirement is met
    ageCheck.out === 1;
}

component main = IdentityVerification();
`;

// Session participation circuit
export const SESSION_CIRCUIT = `
pragma circom 2.0.0;

include "circomlib/mimc.circom";

template SessionParticipation() {
    signal input identity_secret;
    signal input commitment;
    signal input session_type;
    signal input timestamp;
    signal output nullifier;
    
    component mimc = MiMCSponge(1, 220, 1);
    
    // Generate nullifier for session
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== session_type;
    mimc.ins[2] <== timestamp;
    nullifier <== mimc.out[0];
    
    // Verify commitment matches (this would be checked against stored commitment)
    // constraint: commitment == stored_commitment
}

component main = SessionParticipation();
`;

// Age verification circuit
export const AGE_CIRCUIT = `
pragma circom 2.0.0;

include "circomlib/mimc.circom";
include "circomlib/comparators.circom";

template AgeVerification() {
    signal input identity_secret;
    signal input age;
    signal input min_age;
    signal output commitment;
    
    component mimc = MiMCSponge(1, 220, 1);
    component ageCheck = GreaterEqThan(8);
    
    // Calculate commitment
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== age;
    commitment <== mimc.out[0];
    
    // Verify age requirement
    ageCheck.in[0] <== age;
    ageCheck.in[1] <== min_age;
    ageCheck.out === 1;
}

component main = AgeVerification();
`;
