import { logger } from '@/utils/logger'

/**
 * Stark scaffolding layer around the Stellar / Soroban RPC. In production
 * this would use `stellar-sdk` and the Soroban RPC client to build, sign,
 * and submit ContractInvoke transactions. For now we expose a structured
 * interface so route handlers can record tx hashes today and swap the
 * implementation out without changing call sites.
 */

export interface ContractCallOptions {
  contractName: 'payment_escrow' | 'identity_verification' | 'reputation_system' | 'session_management' | 'token_distribution'
  method: string
  args: unknown[]
  signer?: string
}

export interface ContractCallResult {
  txHash: string
  contractId: string
  method: string
  submittedAt: string
}

let SOROBAN_RPC_URL: string | undefined
let NETWORK_PASSPHRASE: string | undefined
let ADMIN_SECRET_KEY: string | undefined

function configure(): void {
  if (SOROBAN_RPC_URL !== undefined) return
  SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL
  NETWORK_PASSPHRASE = process.env.SOROBAN_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
  ADMIN_SECRET_KEY = process.env.STELLAR_ADMIN_SECRET
  if (!SOROBAN_RPC_URL) {
    logger.warn('stellarService: SOROBAN_RPC_URL not set — contract calls will be no-op stubs.')
  }
}

export function isConfigured(): boolean {
  configure()
  return Boolean(SOROBAN_RPC_URL && ADMIN_SECRET_KEY)
}

/**
 * Build, sign, and submit a Soroban contract call. Returns the tx hash.
 * Throws with a structured error if Stellar env vars are missing so the
 * caller (usually a route in sessionService / paymentService) can either
 * fall back to "record-only" mode or surface a 503 to the client.
 */
export async function submitContractCall(opts: ContractCallOptions): Promise<ContractCallResult> {
  configure()
  if (!SOROBAN_RPC_URL) {
    throw new StellarNotConfiguredError(
      `Cannot invoke ${opts.contractName}.${opts.method} — SOROBAN_RPC_URL is not configured.`,
    )
  }
  if (!ADMIN_SECRET_KEY) {
    throw new StellarNotConfiguredError(
      `Cannot invoke ${opts.contractName}.${opts.method} — STELLAR_ADMIN_SECRET is not configured.`,
    )
  }

  // TODO: replace with stellar-sdk Soroban RPC plumbing:
  //   const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: ... })
  //   const tx = await invoke({ ... })
  //   const sent = await server.sendTransaction(tx)
  //   return { txHash: sent.hash, ... }
  // For now log and return a synthetic hash so flow can be wired end-to-end.
  logger.info(`stellarService: submitting ${opts.contractName}.${opts.method}`, { args: opts.args })
  const txHash = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return {
    txHash,
    contractId: opts.contractName,
    method: opts.method,
    submittedAt: new Date().toISOString(),
  }
}

/**
 * Read events emitted by a contract since a given ledger. Returns an empty
 * list if Stellar is not configured so callers can degrade gracefully.
 */
export async function getContractEvents(
  contractName: ContractCallOptions['contractName'],
  _startLedger?: number,
): Promise<Array<{ topic: string; ledger: number; data: string }>> {
  configure()
  if (!SOROBAN_RPC_URL) {
    logger.debug(`stellarService.getContractEvents: no RPC, returning [] for ${contractName}`)
    return []
  }
  // TODO: real implementation via SorobanRpc.Server.getEvents.
  return []
}

export class StellarNotConfiguredError extends Error {
  readonly code = 'STELLAR_NOT_CONFIGURED'
  constructor(message: string) {
    super(message)
    this.name = 'StellarNotConfiguredError'
  }
}

export function networkPassphrase(): string | undefined {
  configure()
  return NETWORK_PASSPHRASE
}

export function adminPublicKey(): string | undefined {
  configure()
  // TODO: derive from ADMIN_SECRET_KEY via stellar-sdk Keypair.fromSecret
  return process.env.STELLAR_ADMIN_PUBLIC_KEY
}
