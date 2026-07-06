import { Router } from 'express'
import { query, body, param, validationResult } from 'express-validator'
import { ProviderType } from '@prisma/client'
import { asyncHandler } from '@/middleware/errorHandler'
import { getAuthUser, requireRole, requireAuth } from '@/middleware/auth'
import { providerWriteLimiter } from '@/middleware/rateLimit'

// Local convenience: admin-only middleware.
const adminOnlyMw = requireRole('ADMIN')
import {
  listProviders,
  searchProviders,
  getProvider,
  registerProvider,
  updateProvider,
  verifyProvider as svcVerifyProvider,
  getProviderSlots,
  updateAvailability as svcUpdateAvailability,
  listReviews,
} from '@/services/providerService'

const router = Router()

const validateList = [
  query('type').optional().isIn(Object.values(ProviderType)),
  query('isOnline').optional().isBoolean(),
  query('isVerified').optional().isBoolean(),
  query('specialty').optional().isString().isLength({ min: 1, max: 100 }),
  query('language').optional().isString().isLength({ min: 2, max: 8 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
]

const validateRegister = [
  body('type').isIn(Object.values(ProviderType)),
  body('bio').isString().isLength({ min: 10, max: 2000 }),
  body('specialties').isArray({ min: 1 }),
  body('languages').isArray({ min: 1 }),
  body('pricePerSession').isFloat({ min: 0 }),
  body('licenseNumber').optional().isString(),
  body('licenseExpiry').optional().isISO8601(),
  body('experience').optional().isInt({ min: 0, max: 80 }),
]

const validateUpdate = [
  param('id').isString().notEmpty(),
  body('bio').optional().isString().isLength({ min: 10, max: 2000 }),
  body('specialties').optional().isArray(),
  body('languages').optional().isArray(),
  body('pricePerSession').optional().isFloat({ min: 0 }),
  body('isOnline').optional().isBoolean(),
  body('licenseExpiry').optional().isISO8601(),
]

// --- Public ----------------------------------------------------------------

// GET /api/v1/providers  – list with filters
router.get('/', validateList, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const result = await listProviders({
    type: req.query.type as ProviderType | undefined,
    isOnline: parseBool(req.query.isOnline),
    isVerified: parseBool(req.query.isVerified),
    specialty: asString(req.query.specialty),
    language: asString(req.query.language),
    page: parseIntOpt(req.query.page),
    limit: parseIntOpt(req.query.limit),
  })
  res.json({ success: true, data: result })
}))

// GET /api/v1/providers/search?q=...
router.get('/search', asyncHandler(async (req, res) => {
  const q = asString(req.query.q) || asString(req.query.query)
  const page = parseIntOpt(req.query.page) ?? 1
  const limit = parseIntOpt(req.query.limit) ?? 20
  const result = await searchProviders(q || '', page, limit)
  res.json({ success: true, data: result })
}))

// GET /api/v1/providers/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const provider = await getProvider(req.params.id)
  res.json({ success: true, data: provider })
}))

// GET /api/v1/providers/:id/slots
router.get('/:id/slots', asyncHandler(async (req, res) => {
  const slots = await getProviderSlots(req.params.id)
  res.json({ success: true, data: slots })
}))

// GET /api/v1/providers/:id/reviews
router.get('/:id/reviews', asyncHandler(async (req, res) => {
  const page = parseIntOpt(req.query.page) ?? 1
  const limit = parseIntOpt(req.query.limit) ?? 20
  const result = await listReviews(req.params.id, page, limit)
  res.json({ success: true, data: result })
}))

// --- Auth required ---------------------------------------------------------

// POST /api/v1/providers/register  – provider fills out their profile
// Must be a PROVIDER (or ADMIN); patients get 403 at the route level.
//
// `providerWriteLimiter` sits AFTER `requireProviderMw` so the keyer sees
// the JWT user id; a bogus unauthenticated request is short-circuited on
// the 403 before it can burn quota.
const requireProviderMw = requireRole('PROVIDER', 'ADMIN')
router.post('/register', validateRegister, requireProviderMw, providerWriteLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const provider = await registerProvider({ userId: user.userId, ...req.body })
  res.status(201).json({ success: true, data: provider })
}))

// PUT /api/v1/providers/:id  – provider updates their own profile
//
// `requireAuth()` runs BEFORE the limiter so the keyer has `req.user.userId`
// available; `providerWriteLimiter` then gates per-user.
router.put('/:id', validateUpdate, requireAuth(), providerWriteLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const user = await getAuthUser(req)
  const provider = await updateProvider(req.params.id, user.userId, req.body)
  res.json({ success: true, data: provider })
}))

// PUT /api/v1/providers/:id/availability  – provider updates JSON schedule
//
// Same ordering as PUT /:id — auth first, limiter keyed by userId second.
router.put('/:id/availability', requireAuth(), providerWriteLimiter, asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  await svcUpdateAvailability(req.params.id, user.userId, req.body)
  res.json({ success: true })
}))

// POST /api/v1/providers/:id/verify  – admin-only verification
//
// Per-user quota so a single admin (or compromised admin token) can't
// verify spam providers; sits AFTER `adminOnlyMw` so req.user.userId is
// available for the keyer.
router.post('/:id/verify', adminOnlyMw, providerWriteLimiter, asyncHandler(async (req, res) => {
  const user = await getAuthUser(req)
  const provider = await svcVerifyProvider(req.params.id, user.userId)
  res.json({ success: true, data: provider })
}))

export default router

// --- tiny helpers -------------------------------------------------------

function asString(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length === 0) return undefined
  return v
}
function parseBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined
  if (v === 'true' || v === true) return true
  if (v === 'false' || v === false) return false
  return undefined
}
function parseIntOpt(v: unknown): number | undefined {
  if (v === undefined) return undefined
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : undefined
}
