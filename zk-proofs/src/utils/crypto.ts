import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

// Cryptographic utilities for ZK proof system
export class CryptoUtils {
  private static readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key';
  private static readonly SALT = 'wellness-zk-salt';

  // Generate random identity secret
  static generateIdentitySecret(): string {
    return CryptoJS.lib.WordArray.random(32).toString();
  }

  // Hash sensitive data for commitments
  static hashData(data: string): string {
    return CryptoJS.SHA256(data + this.SALT).toString();
  }

  // Encrypt sensitive identity data
  static encrypt(data: string, key?: string): string {
    const encryptionKey = key || this.ENCRYPTION_KEY;
    return CryptoJS.AES.encrypt(data, encryptionKey).toString();
  }

  // Decrypt sensitive identity data
  static decrypt(encryptedData: string, key?: string): string {
    const encryptionKey = key || this.ENCRYPTION_KEY;
    const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Generate unique session identifier
  static generateSessionId(): string {
    return uuidv4();
  }

  // Generate timestamp-based nonce
  static generateNonce(): string {
    const timestamp = Date.now().toString();
    const random = CryptoJS.lib.WordArray.random(16).toString();
    return this.hashData(timestamp + random);
  }

  // Convert string to big number for circuit inputs
  static stringToBigNumber(input: string): string {
    const hash = CryptoJS.SHA256(input);
    return hash.toString();
  }

  // Generate deterministic commitment from multiple attributes
  static generateCommitment(attributes: Record<string, string | number | boolean>): string {
    const sortedKeys = Object.keys(attributes).sort();
    const concatenated = sortedKeys.map(key => `${key}:${attributes[key]}`).join('|');
    return this.hashData(concatenated);
  }

  // Verify data integrity
  static verifyIntegrity(data: string, expectedHash: string): boolean {
    const actualHash = this.hashData(data);
    return actualHash === expectedHash;
  }

  // Generate merkle tree leaf
  static generateMerkleLeaf(data: string): string {
    return this.hashData(data);
  }

  // Simple merkle proof verification
  static verifyMerkleProof(
    leaf: string,
    proof: string[],
    root: string
  ): boolean {
    let computedHash = leaf;
    
    for (const proofElement of proof) {
      const combined = computedHash + proofElement;
      computedHash = this.hashData(combined);
    }
    
    return computedHash === root;
  }

  // Generate blinded commitment for privacy
  static generateBlindedCommitment(value: string, blindingFactor: string): string {
    const valueBigNum = BigInt(this.hashData(value));
    const blindingBigNum = BigInt(this.hashData(blindingFactor));
    const blinded = (valueBigNum + blindingBigNum).toString();
    return this.hashData(blinded);
  }

  // Pedersen commitment simulation (simplified)
  static pedersenCommitment(value: string, randomness: string): string {
    const G = '1'; // Generator point (simplified)
    const H = '2'; // Second generator point (simplified)
    
    const valueBigNum = BigInt(this.hashData(value));
    const randomnessBigNum = BigInt(this.hashData(randomness));
    
    const commitment = (valueBigNum * BigInt(G) + randomnessBigNum * BigInt(H)).toString();
    return this.hashData(commitment);
  }

  // Generate zero-knowledge proof challenge
  static generateChallenge(publicInputs: string[]): string {
    const concatenated = publicInputs.join('|');
    return this.hashData(concatenated);
  }

  // Verify signature (simplified)
  static verifySignature(
    message: string,
    signature: string,
    publicKey: string
  ): boolean {
    const expectedSignature = this.hashData(message + publicKey);
    return signature === expectedSignature;
  }

  // Key derivation function
  static deriveKey(seed: string, purpose: string): string {
    return this.hashData(seed + purpose + this.SALT);
  }

  // Generate random salt
  static generateSalt(): string {
    return CryptoJS.lib.WordArray.random(16).toString();
  }

  // Hash to field element (for circuit compatibility)
  static hashToField(input: string, modulus: bigint = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')): string {
    const hash = BigInt(this.hashData(input));
    return (hash % modulus).toString();
  }

  // Generate secure random number in range
  static secureRandom(min: number, max: number): number {
    const range = max - min + 1;
    const randomBytes = CryptoJS.lib.WordArray.random(4);
    const randomValue = parseInt(randomBytes.toString(), 16);
    return min + (randomValue % range);
  }

  // Constant-time comparison to prevent timing attacks
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // Generate HMAC for message authentication
  static hmac(data: string, key?: string): string {
    const hmacKey = key || this.ENCRYPTION_KEY;
    return CryptoJS.HmacSHA256(data, hmacKey).toString();
  }

  // Key stretching function
  static stretchKey(password: string, salt: string, iterations: number = 10000): string {
    let key = password + salt;
    for (let i = 0; i < iterations; i++) {
      key = this.hashData(key);
    }
    return key;
  }

  // Generate deterministic random seed from entropy
  static generateSeedFromEntropy(entropy: string[]): string {
    const sortedEntropy = entropy.slice().sort();
    const combined = sortedEntropy.join('|');
    return this.hashData(combined);
  }

  // Validate format of identity secret
  static validateIdentitySecret(secret: string): boolean {
    // Should be 64 characters (32 bytes in hex)
    return /^[a-fA-F0-9]{64}$/.test(secret);
  }

  // Sanitize and validate input data
  static sanitizeInput(input: unknown): string {
    if (typeof input === 'string') {
      // Remove potentially dangerous characters
      return input.replace(/[<>]/g, '');
    }
    if (typeof input === 'number') {
      return input.toString();
    }
    if (typeof input === 'boolean') {
      return input ? '1' : '0';
    }
    throw new Error('Invalid input type');
  }

  // Generate proof of knowledge without revealing the secret
  static generateProofOfKnowledge(secret: string, challenge: string): string {
    const response = BigInt(this.hashData(secret + challenge));
    return response.toString();
  }

  // Verify proof of knowledge
  static verifyProofOfKnowledge(
    commitment: string,
    challenge: string,
    response: string
  ): boolean {
    // This is a simplified verification
    const expectedResponse = this.hashToField(commitment + challenge);
    return response === expectedResponse;
  }
}

// Constants for ZK proof system
export const ZK_CONSTANTS = {
  FIELD_SIZE: '21888242871839275222246405745257275088548364400416034343698204186575808495617',
  PRIME_FIELD: '21888242871839275222246405745257275088548364400416034343698204186575808495617',
  HASH_LENGTH: 32,
  COMMITMENT_LENGTH: 64,
  NONCE_LENGTH: 16,
  MAX_AGE: 120,
  MIN_AGE: 18,
  SESSION_TYPES: {
    THERAPY: 'therapy',
    COUNSELING: 'counseling',
    PSYCHIATRY: 'psychiatry',
    LIFE_COACHING: 'life_coaching'
  },
  VERIFICATION_LEVELS: {
    NONE: 0,
    BASIC: 1,
    PROFESSIONAL: 2,
    LICENSED: 3,
    VERIFIED: 4
  }
} as const;
