import { Router } from 'express'
import { param, body, validationResult } from 'express-validator'
import { SessionType, SessionStatus } from '@prisma/client'
import { asyncHandler } from '@/middleware/errorHandler'
import { getAuthUser, requireAuth, requireRole } from '@/middleware/auth'
import {
  createSession,
  listSessions,
  getSession,
  startSession,
  completeSession,
  cancelSession,
  joinSession,
} from '@/services/sessionService'

const router = Router()

// Role-gated middleware: only PATIENT (or ADMIN) can create sessions.
const requirePatientOrAdminMw = requireRole('PATIENT', 'ADMIN')

const validateCreate = [
  body('providerId').isString().notEmpty(),
  body('serviceId').isString().notEmpty(),
  body('type').isIn(Object.values(SessionType)),
  body('scheduledAt').isISO8601(),
  body('duration').isInt({ min: 15, max: 240 }),
  body('anonymous').optional().isBoolean(),
  body('zkProofHash').optional().isString(),
]

const validateStart = [
  param('id').isString().notEmpty(),
  body('meetingLink').isURL({ protocols: ['https'], require_protocol: true }),
]

const validateCancel = [
  param('id').isString().notEmpty(),
  body('reason').isString().isLength({ min: 5, max: 500 }),
]

// GET /api/v1/sessions  – caller-role scoped
router.get('/', requireAuth(), asyncHandler(async (req, res) => {
  const user = req.user!
  const result = await listSessions({
    userId: user.userId,
    role: user.role,
    status: req.query.status as SessionStatus | undefined,
    page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
    limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  })
  res.json({ success: true, data: result })
}))

// GET /api/v1/sessions/:id
router.get('/:id', requireAuth(), asyncHandler(async (req, res) => {
  const user = req.user!
  const session = await getSession(req.params.id, user.userId, user.role)
  res.json({ success: true, data: session })
}))

// POST /api/v1/sessions  – patient creates (PATIENT or ADMIN)
router.post('/', validateCreate, requirePatientOrAdminMw, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = req.user!
  const session = await createSession({
    patientId: user.userId,
    providerId: req.body.providerId,
    serviceId: req.body.serviceId,
    type: req.body.type,
    scheduledAt: req.body.scheduledAt,
    duration: req.body.duration,
    anonymous: req.body.anonymous,
    zkProofHash: req.body.zkProofHash,
  })
  res.status(201).json({ success: true, data: session })
}))

// POST /api/v1/sessions/:id/start  – provider starts the session
router.post('/:id/start', validateStart, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const updated = await startSession(req.params.id, user.userId, req.body.meetingLink)
  res.json({ success: true, data: updated })
}))

// POST /api/v1/sessions/:id/complete  – provider completes (fans out to contracts)
router.post('/:id/complete', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : ''
  const updated = await completeSession(req.params.id, user.userId, notes)
  res.json({ success: true, data: updated })
}))

// POST /api/v1/sessions/:id/cancel  – patient, provider, or admin can cancel
router.post('/:id/cancel', validateCancel, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const updated = await cancelSession(req.params.id, user.userId, user.role, req.body.reason)
  res.json({ success: true, data: updated })
}))

// POST /api/v1/sessions/:id/join  – participant joins, optionally with a zk proof hash
router.post('/:id/join', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const result = await joinSession(req.params.id, user.userId, req.body?.zkProofHash)
  res.json({ success: true, data: result })
}))

export default router
