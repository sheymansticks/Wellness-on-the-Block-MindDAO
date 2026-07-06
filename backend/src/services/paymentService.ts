import { prisma } from '@/config/database'
import { logger } from '@/utils/logger'
import { submitContractCall, StellarNotConfiguredError } from '@/services/stellarService'

export interface CreatePaymentInput {
  sessionId: string
  payerId: string
  payeeId: string
  amount: number
  currency?: string
  fee?: number
  paymentMethod?: 'stellar' | 'card'
}

export interface DisputeInput {
  reason: string
  description: string
  evidence?: string[]
}

export interface ResolveDisputeInput {
  refundToPayer: boolean
  refundPercentage: number
}

// --- Read -------------------------------------------------------------------

export async function getPaymentStatus(paymentId: string, requesterId: string, role: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      session: { select: { id: true, patientId: true, providerId: true, status: true } },
    },
  })
  if (!payment) throw httpError(404, 'Payment not found')
  if (
    role !== 'ADMIN' &&
    payment.payerId !== requesterId &&
    payment.payeeId !== requesterId
  ) {
    throw httpError(403, 'You do not have access to this payment')
  }
  return payment
}

export async function listPaymentsForSession(sessionId: string, requesterId: string, role: string) {
  // Dispute is reached via the session relation: Payment -> session -> dispute.
  const payment = await prisma.payment.findUnique({
    where: { sessionId },
    include: { session: { include: { dispute: true } } },
  })
  if (!payment) throw httpError(404, 'No payment for this session')
  if (
    role !== 'ADMIN' &&
    payment.payerId !== requesterId &&
    payment.payeeId !== requesterId
  ) {
    throw httpError(403, 'You do not have access to this payment')
  }
  // Surface nested dispute alongside the payment row so callers see a
  // flat-ish shape without doing the join themselves.
  return { ...payment, dispute: payment.session?.dispute ?? null }
}

// --- Create + escrow --------------------------------------------------------

/**
 * Reserve a payment row and create the on-chain escrow. This does *not* move
 * funds yet — funds come in via `escrowPayment`.
 */
export async function createPayment(input: CreatePaymentInput) {
  if (input.amount <= 0) throw httpError(400, 'amount must be positive')
  if (input.fee !== undefined && (input.fee < 0 || input.fee >= input.amount)) {
    throw httpError(400, 'fee must be between 0 and amount')
  }

  const session = await prisma.session.findUnique({ where: { id: input.sessionId } })
  if (!session) throw httpError(404, 'Session not found')
  if (session.patientId !== input.payerId) {
    throw httpError(403, 'payerId must be the patient on this session')
  }
  if (session.providerId !== input.payeeId) {
    throw httpError(403, 'payeeId must be the provider on this session')
  }

  const existing = await prisma.payment.findUnique({ where: { sessionId: input.sessionId } })
  if (existing) throw httpError(409, 'A payment already exists for this session')

  const fee = input.fee ?? 0
  const payment = await prisma.payment.create({
    data: {
      sessionId: input.sessionId,
      payerId: input.payerId,
      payeeId: input.payeeId,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      fee,
      paymentMethod: input.paymentMethod ?? 'stellar',
      status: 'PENDING',
    },
  })

  try {
    const tx = await submitContractCall({
      contractName: 'payment_escrow',
      method: 'create_escrow',
      args: [
        numericSessionId(payment.sessionId),
        providerStellarAddress(input.payeeId),
        amountToContractUnits(input.amount),
        paymentCurrencySymbol(payment.currency),
        24, // default duration_hours
      ],
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: { escrowTxId: tx.txHash, stellarContract: tx.contractId },
    })
  } catch (err) {
    if (!(err instanceof StellarNotConfiguredError)) throw err
    logger.warn(`createPayment: ledger call skipped (${err.message})`)
  }

  return payment
}

/**
 * Patient-funded path. DB status -> ESCROWED. The actual token transfer is
 * performed by the Stellar `TokenClient.transfer` inside the contract; from
 * the backend's perspective we just record the tx hash.
 */
export async function escrowPayment(paymentId: string, payerId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw httpError(404, 'Payment not found')
  if (payment.payerId !== payerId) throw httpError(403, 'Only the payer can fund the escrow')
  if (payment.status !== 'PENDING') {
    throw httpError(409, `Cannot escrow a payment in status ${payment.status}`)
  }

  try {
    const tx = await submitContractCall({
      contractName: 'payment_escrow',
      method: 'fund_escrow',
      args: [
        numericSessionId(payment.sessionId),
        amountToContractUnits(payment.amount),
      ],
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'ESCROWED', escrowTxId: tx.txHash },
    })
  } catch (err) {
    if (err instanceof StellarNotConfiguredError) {
      // Degrade gracefully: leave DB row in PENDING (still recoverable) and
      // let the caller proceed. Consistent with the other payment methods.
      logger.warn(`escrowPayment: ledger call skipped (${err.message}); payment stays PENDING for manual sync`)
      return prisma.payment.findUnique({ where: { id: paymentId } })
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    })
    throw err
  }
  return prisma.payment.findUnique({ where: { id: paymentId } })
}

// --- Release / refund -------------------------------------------------------

/**
 * Release escrow funds to the provider. Normally driven by
 * sessionService.completeSession after the on-chain session completion tx;
 * exposed as an idempotent helper in case it has to be retried.
 */
export async function releasePayment(paymentId: string, requesterId: string, role: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { session: true },
  })
  if (!payment) throw httpError(404, 'Payment not found')
  if (role !== 'ADMIN' && payment.session.providerId !== requesterId) {
    throw httpError(403, 'Only the provider or admin can release')
  }
  if (payment.status !== 'ESCROWED' && payment.status !== 'DISPUTED') {
    throw httpError(409, `Cannot release a payment in status ${payment.status}`)
  }

  try {
    const tx = await submitContractCall({
      contractName: 'payment_escrow',
      method: 'complete_session',
      args: [numericSessionId(payment.sessionId)],
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        releaseTxId: tx.txHash,
        netAmount: payment.amount - payment.fee,
      },
    })
  } catch (err) {
    if (!(err instanceof StellarNotConfiguredError)) throw err
    logger.warn(`releasePayment: ledger call skipped (${err.message})`)
  }
  return prisma.payment.findUnique({ where: { id: paymentId } })
}

/**
 * Refund escrow back to the payer. Admin can refund immediately; the payer
 * can only refund after the contract's deadline has elapsed (enforced on-chain).
 */
export async function refundPayment(paymentId: string, requesterId: string, role: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { session: true },
  })
  if (!payment) throw httpError(404, 'Payment not found')
  if (role !== 'ADMIN' && payment.payerId !== requesterId) {
    throw httpError(403, 'Only admin or the original payer can refund')
  }
  if (!['ESCROWED', 'DISPUTED'].includes(payment.status)) {
    throw httpError(409, `Cannot refund a payment in status ${payment.status}`)
  }

  try {
    const tx = await submitContractCall({
      contractName: 'payment_escrow',
      method: 'refund_escrow',
      args: [numericSessionId(payment.sessionId)],
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', refundTxId: tx.txHash },
    })
  } catch (err) {
    if (!(err instanceof StellarNotConfiguredError)) throw err
    logger.warn(`refundPayment: ledger call skipped (${err.message})`)
  }
  return prisma.payment.findUnique({ where: { id: paymentId } })
}

// --- Dispute ----------------------------------------------------------------

export async function disputePayment(
  paymentId: string,
  requesterId: string,
  input: DisputeInput,
) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw httpError(404, 'Payment not found')
  if (payment.payerId !== requesterId && payment.payeeId !== requesterId) {
    throw httpError(403, 'Only payer or payee can dispute')
  }
  if (payment.status !== 'ESCROWED' && payment.status !== 'PENDING') {
    throw httpError(409, `Cannot dispute a payment in status ${payment.status}`)
  }

  try {
    await submitContractCall({
      contractName: 'payment_escrow',
      method: 'dispute_escrow',
      args: [numericSessionId(payment.sessionId), input.reason],
    })
  } catch (err) {
    if (!(err instanceof StellarNotConfiguredError)) throw err
    logger.warn(`disputePayment: ledger call skipped (${err.message})`)
  }

  const dispute = await prisma.dispute.upsert({
    where: { sessionId: payment.sessionId },
    create: {
      sessionId: payment.sessionId,
      initiatedBy: requesterId,
      reason: input.reason,
      description: input.description,
      evidence: input.evidence ?? [],
      status: 'OPEN',
    },
    update: {
      initiatedBy: requesterId,
      reason: input.reason,
      description: input.description,
      evidence: input.evidence ?? [],
      status: 'OPEN',
    },
  })

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'DISPUTED' },
  })
  return dispute
}

/**
 * Admin-only. Splits the escrow according to refundPercentage. If
 * `refundToPayer` is false, funds go entirely to the provider (minus fee).
 */
export async function resolveDispute(
  paymentId: string,
  adminId: string,
  role: string,
  input: ResolveDisputeInput,
) {
  if (role !== 'ADMIN') throw httpError(403, 'Only admins can resolve disputes')
  if (input.refundPercentage < 0 || input.refundPercentage > 100) {
    throw httpError(400, 'refundPercentage must be 0–100')
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw httpError(404, 'Payment not found')
  if (payment.status !== 'DISPUTED') {
    throw httpError(409, `Cannot resolve a payment in status ${payment.status}`)
  }

  try {
    await submitContractCall({
      contractName: 'payment_escrow',
      method: 'resolve_dispute',
      args: [
        numericSessionId(payment.sessionId),
        input.refundToPayer,
        input.refundPercentage,
      ],
    })
  } catch (err) {
    if (!(err instanceof StellarNotConfiguredError)) throw err
    logger.warn(`resolveDispute: ledger call skipped (${err.message})`)
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: input.refundToPayer ? 'REFUNDED' : 'COMPLETED',
      netAmount: input.refundToPayer
        ? payment.amount * (input.refundPercentage / 100)
        : payment.amount - payment.fee,
    },
  })

  return prisma.dispute.update({
    where: { sessionId: payment.sessionId },
    data: {
      status: 'RESOLVED',
      resolvedBy: adminId,
      resolvedAt: new Date(),
      resolution: `${input.refundToPayer ? 'Refunded' : 'Released'} ${input.refundPercentage}% to payer`,
    },
  })
}

// --- Helpers ---------------------------------------------------------------

function httpError(status: number, message: string): Error {
  const err: Error & { statusCode?: number } = new Error(message)
  err.statusCode = status
  return err
}

/**
 * Map a Prisma cuid sessionId to a u64-compatible number for Soroban.
 *
 * ⚠️ STUB — REPLACE BEFORE PRODUCTION.
 *
 * SessionManagement.create_session returns a real on-chain u64 counter that
 * is the authoritative escrow key. Today we hash our cuid locally so the
 * scaffolding stays in sync with the offline ledger; if the backend ever
 * co-exists with a SessionManagement contract deployed by another actor,
 * different u64 encodings can collide or address the wrong escrow.
 *
 * Fix: have the backend first call SessionManagement.create_session and
 * persist the returned u64 alongside the cuid on Session.id.
 */
function numericSessionId(cuid: string): number {
  let n = 0
  for (let i = 0; i < cuid.length; i++) {
    n = (n * 31 + cuid.charCodeAt(i)) >>> 0
  }
  return n
}

/**
 * Convert a USD-amount to 7-decimal SAC units used by Stellar assets. Returns
 * a plain `string` — payload contract args must survive JSON.stringify, which
 * cannot represent `BigInt` natively.
 */
function amountToContractUnits(amount: number): string {
  return Math.round(amount * 10_000_000).toString()
}

function paymentCurrencySymbol(currency: string): string {
  return currency.slice(0, 12) || 'USD'
}

/**
 * Stub: in production this would look up the provider's published Stellar
 * address. For scaffolding we use a deterministic placeholder so the worker
 * doesn't fail pre-deploy.
 */
function providerStellarAddress(providerId: string): string {
  return 'G' + providerId.replace(/[^A-Z2-7]/gi, '').slice(0, 55).toUpperCase().padEnd(55, 'A')
}
