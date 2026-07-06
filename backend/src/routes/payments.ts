import { Router } from 'express'
import { body, param, validationResult } from 'express-validator'
import { asyncHandler } from '@/middleware/errorHandler'
import { getAuthUser, requireRole, requireAuth } from '@/middleware/auth'
import { paymentReleaseLimiter } from '@/middleware/rateLimit'
import {
  createPayment,
  escrowPayment,
  releasePayment,
  refundPayment,
  disputePayment,
  resolveDispute,
  getPaymentStatus,
  listPaymentsForSession,
} from '@/services/paymentService'

const router = Router()
const adminOnlyMw = requireRole('ADMIN')

const validateCreate = [
  body('sessionId').isString().notEmpty(),
  body('payeeId').isString().notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('currency').optional().isString().isLength({ min: 1, max: 12 }),
  body('fee').optional().isFloat({ min: 0 }),
  body('paymentMethod').optional().isIn(['stellar', 'card']),
]

const validateDispute = [
  param('id').isString().notEmpty(),
  body('reason').isString().isLength({ min: 5, max: 100 }),
  body('description').isString().isLength({ min: 10, max: 2000 }),
  body('evidence').optional().isArray(),
]

const validateResolve = [
  param('id').isString().notEmpty(),
  body('refundToPayer').isBoolean(),
  body('refundPercentage').isInt({ min: 0, max: 100 }),
]

// GET /api/v1/payments/:id  – payer / payee / admin
router.get('/:id', requireAuth(), asyncHandler(async (req, res) => {
  const user = req.user!
  const result = await getPaymentStatus(req.params.id, user.userId, user.role)
  res.json({ success: true, data: result })
}))

// GET /api/v1/payments/by-session/:sessionId  – same access as above
router.get('/by-session/:sessionId', requireAuth(), asyncHandler(async (req, res) => {
  const user = req.user!
  const result = await listPaymentsForSession(req.params.sessionId, user.userId, user.role)
  res.json({ success: true, data: result })
}))

// POST /api/v1/payments  – payer reserves an escrow
router.post('/', validateCreate, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const result = await createPayment({
    sessionId: req.body.sessionId,
    payerId: user.userId,
    payeeId: req.body.payeeId,
    amount: req.body.amount,
    currency: req.body.currency,
    fee: req.body.fee,
    paymentMethod: req.body.paymentMethod,
  })
  res.status(201).json({ success: true, data: result })
}))

// POST /api/v1/payments/:id/escrow  – payer funds the escrow
router.post('/:id/escrow', param('id').isString().notEmpty(), asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const result = await escrowPayment(req.params.id, user.userId)
  res.json({ success: true, data: result })
}))

// POST /api/v1/payments/:id/release  – provider (or admin) releases
//
// Per-user rate limit (30/min) gates this on-chain fan-out. `requireAuth()`
// runs first so `req.user.userId` is populated for the limiter's
// keyGenerator; `paymentReleaseLimiter` then keys off that subject.
router.post('/:id/release', param('id').isString().notEmpty(), requireAuth(), paymentReleaseLimiter, asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const result = await releasePayment(req.params.id, user.userId, user.role)
  res.json({ success: true, data: result })
}))

// POST /api/v1/payments/:id/refund  – admin or payer (post-deadline)
router.post('/:id/refund', param('id').isString().notEmpty(), asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const result = await refundPayment(req.params.id, user.userId, user.role)
  res.json({ success: true, data: result })
}))

// POST /api/v1/payments/:id/dispute  – payer or payee
router.post('/:id/dispute', validateDispute, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const result = await disputePayment(req.params.id, user.userId, {
    reason: req.body.reason,
    description: req.body.description,
    evidence: req.body.evidence,
  })
  res.status(201).json({ success: true, data: result })
}))

// POST /api/v1/payments/:id/resolve  – admin only
router.post('/:id/resolve', validateResolve, adminOnlyMw, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const result = await resolveDispute(req.params.id, user.userId, user.role, {
    refundToPayer: req.body.refundToPayer,
    refundPercentage: req.body.refundPercentage,
  })
  res.json({ success: true, data: result })
}))

export default router
