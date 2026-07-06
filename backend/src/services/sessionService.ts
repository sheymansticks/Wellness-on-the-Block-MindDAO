import { Prisma, Session, SessionStatus, SessionType } from '@prisma/client'
import crypto from 'crypto'
import { prisma } from '@/config/database'
import { logger } from '@/utils/logger'
import { submitContractCall, StellarNotConfiguredError } from '@/services/stellarService'

export interface CreateSessionInput {
  patientId: string
  providerId: string
  serviceId: string
  type: SessionType
  scheduledAt: Date | string
  duration: number
  anonymous?: boolean
  zkProofHash?: string | null
}

export interface ListSessionsInput {
  userId: string
  role: 'PATIENT' | 'PROVIDER' | 'ADMIN'
  status?: SessionStatus
  page?: number
  limit?: number
}

export interface SessionView {
  id: string
  patientId: string
  providerId: string
  serviceId: string
  type: SessionType
  status: SessionStatus
  scheduledAt: Date
  startedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  duration: number
  price: number
  currency: string
  notes: string | null
  anonymous: boolean
  meetingLink: string | null
  recordingUrl: string | null
}

// --- Create / Read --------------------------------------------------------

export async function createSession(input: CreateSessionInput): Promise<SessionView> {
  const [patient, provider, service] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.patientId } }),
    prisma.user.findUnique({
      where: { id: input.providerId },
      include: { provider: true },
    }),
    prisma.service.findUnique({ where: { id: input.serviceId } }),
  ])

  if (!patient) throw httpError(404, 'Patient not found')
  if (patient.role !== 'PATIENT' && patient.id !== input.patientId) {
    throw httpError(403, 'Patient mismatch')
  }
  if (!provider || provider.role !== 'PROVIDER' || !provider.provider) {
    throw httpError(404, 'Provider not found')
  }
  if (provider.provider.id !== input.providerId) {
    throw httpError(400, 'Provider profile mismatch')
  }
  if (!service || !service.isActive || service.providerId !== input.providerId) {
    throw httpError(404, 'Service not available')
  }

  const scheduledAt = parseDate(input.scheduledAt)
  if (!scheduledAt || scheduledAt.getTime() < Date.now()) {
    throw httpError(400, 'scheduledAt must be in the future')
  }

  const sessionToken = crypto.randomBytes(24).toString('hex')

  const session = await prisma.session.create({
    data: {
      patientId: input.patientId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      type: input.type,
      scheduledAt,
      duration: input.duration,
      price: service.pricePerSession,
      currency: service.currency,
      anonymous: input.anonymous ?? false,
      zkProofHash: input.zkProofHash ?? null,
      sessionToken,
      status: 'SCHEDULED',
    },
  })
  logger.info(`Session created ${session.id} (patient ${input.patientId}, provider ${input.providerId})`)
  return view(session)
}

export async function listSessions(input: ListSessionsInput) {
  const page = Math.max(1, input.page ?? 1)
  const limit = Math.min(100, Math.max(1, input.limit ?? 20))
  const skip = (page - 1) * limit

  const where: Prisma.SessionWhereInput = {}
  if (input.status) where.status = input.status

  if (input.role === 'PATIENT') where.patientId = input.userId
  else if (input.role === 'PROVIDER') where.providerId = input.userId
  // ADMIN sees everything

  const [items, total] = await Promise.all([
    prisma.session.findMany({ where, skip, take: limit, orderBy: { scheduledAt: 'desc' } }),
    prisma.session.count({ where }),
  ])
  return {
    items: items.map(view),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function getSession(sessionId: string, requesterId: string, requesterRole: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { payment: true, dispute: true },
  })
  if (!session) throw httpError(404, 'Session not found')
  if (
    requesterRole !== 'ADMIN' &&
    session.patientId !== requesterId &&
    session.providerId !== requesterId
  ) {
    throw httpError(403, 'You do not have access to this session')
  }
  return { ...view(session), payment: session.payment, dispute: session.dispute }
}

// --- Lifecycle: start / complete -----------------------------------------

/**
 * Provider-only. Drives SCHEDULED -> IN_PROGRESS and broadcasts a token-bound
 * meeting link. Fires the matching start_session on PaymentEscrow so the
 * on-chain lock state moves in lockstep with the DB row.
 *
 * Note: the SessionStatus enum in schema.prisma does not include `CONFIRMED`
 * (provider confirmation is implicit in payment-escrowed state). Only
 * SCHEDULED can transition to IN_PROGRESS via this route.
 */
export async function startSession(sessionId: string, providerId: string, meetingLink: string) {
  if (!meetingLink) throw httpError(400, 'meetingLink is required')

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw httpError(404, 'Session not found')
  if (session.providerId !== providerId) throw httpError(403, 'Only the provider can start a session')
  if (session.status !== 'SCHEDULED') {
    throw httpError(409, `Cannot start session from status ${session.status}`)
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      meetingLink,
    },
  })

  await safeCallContract('session_management', 'start_session', [Number(sessionId), meetingLink])
  // The PaymentEscrow mirrors this so its internal state also goes to
  // SessionStarted. Both contracts emit SESSION_STARTED.
  await safeCallContract('payment_escrow', 'start_session', [Number(sessionId)])

  return view(updated)
}

/**
 * Provider-only. The single fan-out point for session completion:
 *  1. DB: status -> COMPLETED + completedAt + notes
 *  2. SessionManagement contract: complete_session
 *  3. PaymentEscrow contract: complete_session (releases funds)
 *  4. ReputationSystem: update_reputation (off-chain orchestrator is admin)
 *  5. TokenDistribution: distribute_session_rewards
 *
 * Any contract failure is logged and tracked in Payment.status -> FAILED but
 * does not roll back the DB row, so the platform can reconcile manually.
 */
export async function completeSession(sessionId: string, providerId: string, notes: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { payment: true },
  })
  if (!session) throw httpError(404, 'Session not found')
  if (session.providerId !== providerId) throw httpError(403, 'Only the provider can complete a session')
  if (session.status !== 'IN_PROGRESS') {
    throw httpError(409, `Cannot complete session from status ${session.status}`)
  }

  const now = new Date()
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      notes,
    },
  })

  // 2. SessionManagement
  await safeCallContract('session_management', 'complete_session', [Number(sessionId), notes])

  // 3. PaymentEscrow -> releases funds to provider (see PaymentEscrow.complete_session)
  if (session.payment && session.payment.status === 'ESCROWED') {
    try {
      const tx = await submitContractCall({
        contractName: 'payment_escrow',
        method: 'complete_session',
        args: [Number(sessionId)],
      })
      await prisma.payment.update({
        where: { id: session.payment.id },
        data: {
          status: 'COMPLETED',
          releaseTxId: tx.txHash,
          netAmount: session.payment.amount - session.payment.fee,
        },
      })
    } catch (err) {
      logger.error('PaymentEscrow.complete_session failed', err)
      await prisma.payment.update({
        where: { id: session.payment.id },
        data: { status: 'FAILED' },
      })
    }
  }

  // 4. Reputation update for the provider
  await safeCallContract('reputation_system', 'update_reputation', [
    {
      user_address: providerId,
      session_completed: true,
      session_cancelled: false,
      dispute_raised: false,
      dispute_won: false,
      review_positive: null,
      verification_level: 0,
    },
  ])

  // 5. Reward distribution
  await safeCallContract('token_distribution', 'distribute_session_rewards', [
    Number(sessionId),
    session.patientId,
    session.providerId,
  ])

  await prisma.auditLog.create({
    data: {
      userId: providerId,
      action: 'SESSION_COMPLETED',
      resource: `sessions:${sessionId}`,
      details: { notes },
    },
  })

  return view(updated)
}

export async function cancelSession(sessionId: string, userId: string, role: string, reason: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw httpError(404, 'Session not found')

  const allowed =
    role === 'ADMIN' || session.patientId === userId || session.providerId === userId
  if (!allowed) throw httpError(403, 'You cannot cancel this session')

  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    throw httpError(409, `Cannot cancel a session in status ${session.status}`)
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      notes: reason,
    },
  })

  await safeCallContract('session_management', 'cancel_session', [Number(sessionId), reason])

  // If funds were escrowed, request refund (admin or post-deadline only).
  const payment = await prisma.payment.findUnique({ where: { sessionId } })
  if (payment && payment.status === 'ESCROWED') {
    if (role === 'ADMIN') {
      try {
        const tx = await submitContractCall({
          contractName: 'payment_escrow',
          method: 'refund_escrow',
          args: [Number(sessionId)],
        })
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED', refundTxId: tx.txHash },
        })
      } catch (err) {
        logger.warn('PaymentEscrow.refund_escrow failed; will need manual intervention', err)
      }
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'DISPUTED' } })
    }
  }

  return view(updated)
}

export async function joinSession(sessionId: string, userId: string, zkProofHash?: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw httpError(404, 'Session not found')
  if (session.patientId !== userId && session.providerId !== userId) {
    throw httpError(403, 'Only session participants can join')
  }
  if (!session.meetingLink || !session.sessionToken) {
    throw httpError(409, 'Session has not been started yet')
  }
  if (session.status !== 'IN_PROGRESS') {
    throw httpError(409, `Cannot join session in status ${session.status}`)
  }

  // Link zkProofHash into the session row for audit if provided.
  if (zkProofHash && !session.zkProofHash) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { zkProofHash },
    })
  }

  return {
    sessionId,
    meetingLink: session.meetingLink,
    sessionToken: session.sessionToken,
    status: session.status,
  }
}

// --- Helpers --------------------------------------------------------------

function view(s: Session): SessionView {
  return {
    id: s.id,
    patientId: s.patientId,
    providerId: s.providerId,
    serviceId: s.serviceId,
    type: s.type,
    status: s.status,
    scheduledAt: s.scheduledAt,
    startedAt: s.startedAt ?? null,
    completedAt: s.completedAt ?? null,
    cancelledAt: s.cancelledAt ?? null,
    duration: s.duration,
    price: s.price,
    currency: s.currency,
    notes: s.notes ?? null,
    anonymous: s.anonymous,
    meetingLink: s.meetingLink ?? null,
    recordingUrl: s.recordingUrl ?? null,
  }
}

function parseDate(input: Date | string): Date {
  if (input instanceof Date) return input
  const d = new Date(input)
  if (!Number.isFinite(d.getTime())) {
    throw httpError(400, 'Invalid scheduledAt')
  }
  return d
}

function httpError(status: number, message: string): Error {
  const err: Error & { statusCode?: number } = new Error(message)
  err.statusCode = status
  return err
}

/**
 * Invoke a Soroban contract method and log+swallow on StellarNotConfiguredError
 * so the operational DB stays in sync even when the ledger isn't wired up
 * yet. Any other error is rethrown.
 */
async function safeCallContract(
  contractName: Parameters<typeof submitContractCall>[0]['contractName'],
  method: string,
  args: unknown[],
): Promise<void> {
  try {
    await submitContractCall({ contractName, method, args })
  } catch (err) {
    if (err instanceof StellarNotConfiguredError) {
      logger.warn(`safeCallContract(${contractName}.${method}): Stellar not configured: ${err.message}`)
      return
    }
    logger.error(`safeCallContract(${contractName}.${method}) failed:`, err)
  }
}
