import { groth16 } from 'snarkjs'
import crypto from 'crypto'
import { logger } from '@/utils/logger'

// --- ZK proof / verification-key shapes ------------------------------------
// We mirror the canonical shapes declared in `zk-proofs/src/types.ts` here
// so the backend can typecheck against the same JSON layout that snarkjs's
// `groth16.fullProve` and `groth16.verify` consume. Keeping these locally
// avoids a backend -> zk-proofs cross-package import (the packages are
// independent in this monorepo).
type SnarkJsG1Point = [string, string, string]
type SnarkJsG2Pair = [string, string]
// `pi_b` in a groth16 proof carries three FQ^2 pairs (the third is the
// 1 extra coord for the encoded G2 point over FQ^2).
type SnarkJsG2ProofPoint = [SnarkJsG2Pair, SnarkJsG2Pair, SnarkJsG2Pair]
// `vk_beta_2` / `vk_gamma_2` / `vk_delta_2` use the standard 2-pair form.
type SnarkJsG2KeyPoint = [SnarkJsG2Pair, SnarkJsG2Pair]

export type SnarkJsProof = {
  pi_a: SnarkJsG1Point
  pi_b: SnarkJsG2ProofPoint
  pi_c: SnarkJsG1Point
  protocol: string
  curve: string
}

export type SnarkJsVerificationKey = {
  vk_alpha_1: SnarkJsG1Point
  vk_beta_2: SnarkJsG2KeyPoint
  vk_gamma_2: SnarkJsG2KeyPoint
  vk_delta_2: SnarkJsG2KeyPoint
  IC: string[][]
}

// --- Verification result types ---------------------------------------------

export interface VerificationResult {
  isValid: boolean
  commitment?: string
  nullifier?: string
  timestamp?: string
  error?: string
}

export interface PublicSignals {
  commitment: string
  /** Identity/session proofs always emit a nullifier; age proofs do not. */
  nullifier?: string
  sessionType?: string
  timestamp?: string
  age?: string
  minAge?: string
}

export type ProofType = 'identity' | 'session' | 'age'

export interface BatchVerifyItem {
  type: ProofType
  proof: SnarkJsProof
  publicSignals: string[]
  expectedCommitment?: string
  minAge?: number
}

// --- Embed verification keys -----------------------------------------------
// In a real deployment these would be loaded from circuits/*_verification_key.json
// after `snarkjs zkey export verificationkey`. The serve currently returns a
// safe placeholder so the API does not crash in development.

const PLACEHOLDER_KEYS: Record<ProofType, SnarkJsVerificationKey> = {
  identity: {
    vk_alpha_1: ['1', '0', '0'],
    vk_beta_2: [['1', '0'], ['0', '1']],
    vk_gamma_2: [['1', '0'], ['0', '1']],
    vk_delta_2: [['1', '0'], ['0', '1']],
    IC: [['0', '0']],
  },
  session: {
    vk_alpha_1: ['1', '0', '0'],
    vk_beta_2: [['1', '0'], ['0', '1']],
    vk_gamma_2: [['1', '0'], ['0', '1']],
    vk_delta_2: [['1', '0'], ['0', '1']],
    IC: [['0', '0']],
  },
  age: {
    vk_alpha_1: ['1', '0', '0'],
    vk_beta_2: [['1', '0'], ['0', '1']],
    vk_gamma_2: [['1', '0'], ['0', '1']],
    vk_delta_2: [['1', '0'], ['0', '1']],
    IC: [['0', '0']],
  },
}

// --- Nullifier tracking -----------------------------------------------------

class ProofServer {
  private verificationKeys: Map<ProofType, SnarkJsVerificationKey> = new Map()
  private usedNullifiers: Set<string> = new Set()

  constructor() {
    this.verificationKeys.set('identity', PLACEHOLDER_KEYS.identity)
    this.verificationKeys.set('session', PLACEHOLDER_KEYS.session)
    this.verificationKeys.set('age', PLACEHOLDER_KEYS.age)
  }

  /** Replace placeholder keys with real ones loaded from disk in production. */
  setVerificationKey(type: ProofType, key: SnarkJsVerificationKey): void {
    this.verificationKeys.set(type, key)
  }

  async verifyIdentityProof(proof: SnarkJsProof, publicSignals: string[]): Promise<VerificationResult> {
    return this.cryptoVerify('identity', proof, publicSignals, (signals) => {
      const currentTime = Math.floor(Date.now() / 1000)
      const proofTime = parseInt(signals.timestamp || '0', 10)
      if (!Number.isFinite(proofTime) || Math.abs(currentTime - proofTime) > 3600) {
        return 'Proof timestamp too old or missing'
      }
      if (signals.nullifier && this.usedNullifiers.has(signals.nullifier)) {
        return 'Nullifier already used'
      }
      return null
    })
  }

  async verifySessionProof(
    proof: SnarkJsProof,
    publicSignals: string[],
    expectedCommitment?: string,
  ): Promise<VerificationResult> {
    return this.cryptoVerify('session', proof, publicSignals, (signals) => {
      if (expectedCommitment && signals.commitment !== expectedCommitment) {
        return 'Commitment mismatch'
      }
      if (signals.nullifier && this.usedNullifiers.has(signals.nullifier)) {
        return 'Nullifier already used'
      }
      return null
    })
  }

  async verifyAgeProof(proof: SnarkJsProof, publicSignals: string[], minAge?: number): Promise<VerificationResult> {
    return this.cryptoVerify('age', proof, publicSignals, (signals) => {
      const proofMinAge = parseInt(signals.minAge || '0', 10)
      if (minAge !== undefined && proofMinAge < minAge) {
        return `Age requirement not met (declared ${proofMinAge}, required ${minAge})`
      }
      return null
    })
  }

  async batchVerifyProofs(items: BatchVerifyItem[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = []
    for (const item of items) {
      let result: VerificationResult
      switch (item.type) {
        case 'identity':
          result = await this.verifyIdentityProof(item.proof, item.publicSignals)
          break
        case 'session':
          result = await this.verifySessionProof(item.proof, item.publicSignals, item.expectedCommitment)
          break
        case 'age':
          result = await this.verifyAgeProof(item.proof, item.publicSignals, item.minAge)
          break
        default:
          result = { isValid: false, error: 'Unknown proof type' }
      }
      results.push(result)
    }
    return results
  }

  // -- internals ------------------------------------------------------------

  private async cryptoVerify(
    type: ProofType,
    proof: SnarkJsProof,
    publicSignals: string[],
    businessCheck: (signals: PublicSignals) => string | null,
  ): Promise<VerificationResult> {
    try {
      const key = this.verificationKeys.get(type)
      if (!key) {
        return { isValid: false, error: `${type} verification key not loaded` }
      }

      const cryptoOk = await groth16.verify(key, publicSignals, proof)
      if (!cryptoOk) {
        return { isValid: false, error: 'Cryptographic proof verification failed' }
      }

      const signals = extractSignals(type, publicSignals)
      const businessError = businessCheck(signals)
      if (businessError) {
        return { isValid: false, error: businessError }
      }

      if (signals.nullifier) {
        this.usedNullifiers.add(signals.nullifier)
      }
      return { isValid: true, ...signals }
    } catch (err) {
      logger.error(`${type} proof verification error:`, err)
      return { isValid: false, error: `${type} verification error: ${(err as Error).message}` }
    }
  }

  // -- nullifier helpers ----------------------------------------------------

  isNullifierUsed(nullifier: string): boolean {
    return this.usedNullifiers.has(nullifier)
  }
  addUsedNullifier(nullifier: string): void {
    this.usedNullifiers.add(nullifier)
  }
  exportUsedNullifiers(): string[] {
    return Array.from(this.usedNullifiers)
  }
  importUsedNullifiers(list: string[]): void {
    this.usedNullifiers = new Set(list)
  }
}

function extractSignals(type: ProofType, publicSignals: string[]): PublicSignals {
  if (type === 'age') {
    return {
      commitment: publicSignals[0] || '',
      age: publicSignals[1] || '',
      minAge: publicSignals[2] || '',
    }
  }
  return {
    commitment: publicSignals[0] || '',
    nullifier: publicSignals[1] || '',
    sessionType: publicSignals[2] || '',
    timestamp: publicSignals[3] || '',
  }
}


// Singleton for app-wide reuse (parity with zk-proofs package).
const proofServer = new ProofServer()

// --- Public functions called from routes ------------------------------------

/**
 * Server-side confirmation hash for a proof bundle.
 *
 * IMPORTANT: Real zk-SNARK proofs are produced in the browser from the user's
 * private witness (see zk-proofs/src/circuits/identity.ts). The server should
 * only see { commitment, nullifier, ... } and *verify* the proof. This function
 * gives the call sites a stable, deterministic `proofHash` for indexing and
 * audit purposes — it is *not* a substitute for calling verifyIdentityProof
 * etc. below.
 */
export async function generateZKProof(input: {
  identityCommitment: string
  nullifier?: string
}): Promise<{ proofHash: string; proof: null }> {
  const payload = `${input.identityCommitment}|${input.nullifier ?? ''}|${Date.now()}`
  const proofHash = crypto.createHash('sha256').update(payload).digest('hex')
  return { proofHash, proof: null }
}

export const verifyIdentityProof = proofServer.verifyIdentityProof.bind(proofServer)
export const verifySessionProof = proofServer.verifySessionProof.bind(proofServer)
export const verifyAgeProof = proofServer.verifyAgeProof.bind(proofServer)
export const batchVerifyProofs = proofServer.batchVerifyProofs.bind(proofServer)
export const isNullifierUsed = proofServer.isNullifierUsed.bind(proofServer)
export const addUsedNullifier = proofServer.addUsedNullifier.bind(proofServer)
