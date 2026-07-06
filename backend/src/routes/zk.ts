import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import { asyncHandler } from '@/middleware/errorHandler'
import { adminOnly, requireRole } from '@/middleware/auth'
import { zkVerifyLimiter, verifyRateLimit } from '@/middleware/rateLimit'
import {
  generateZKProof,
  verifyIdentityProof,
  verifySessionProof,
  verifyAgeProof,
  batchVerifyProofs,
} from '@/services/zkService'

const router = Router()

const validateVerify = [
  body('proof').exists(),
  body('publicSignals').isArray({ min: 1 }),
]
const validateSessionVerify = [
  ...validateVerify,
  body('expectedCommitment').optional().isString(),
]
const validateAgeVerify = [
  ...validateVerify,
  body('minAge').optional().isInt({ min: 0, max: 120 }),
]
const validateBatch = [
  body('items').isArray({ min: 1, max: 50 }),
  body('items.*.type').isIn(['identity', 'session', 'age']),
]
const validateProof = [
  body('identityCommitment').isString().isLength({ min: 1, max: 256 }),
  body('nullifier').optional().isString().isLength({ min: 1, max: 256 }),
]

// /api/v1/zk/verify/* endpoints are ADMIN-only: the verifier key material
// is sensitive and the routes cost real CPU.
const adminOnlyMw = adminOnly()

// /api/v1/zk/proof is reachable by any authenticated caller — it only
// produces a deterministic confirmation-hash used for indexing the user's
// proof bundle. The actual zk-SNARK proof is generated in the browser.
const requireAnyAuthMw = requireRole('PATIENT', 'PROVIDER', 'ADMIN')

// POST /api/v1/zk/verify/identity
router.post('/verify/identity', validateVerify, adminOnlyMw, zkVerifyLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const result = await verifyIdentityProof(req.body.proof, req.body.publicSignals)
  res.json({ success: true, data: result })
}))

// POST /api/v1/zk/verify/session
router.post('/verify/session', validateSessionVerify, adminOnlyMw, zkVerifyLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const result = await verifySessionProof(req.body.proof, req.body.publicSignals, req.body.expectedCommitment)
  res.json({ success: true, data: result })
}))

// POST /api/v1/zk/verify/age
router.post('/verify/age', validateAgeVerify, adminOnlyMw, zkVerifyLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const result = await verifyAgeProof(req.body.proof, req.body.publicSignals, req.body.minAge)
  res.json({ success: true, data: result })
}))

// POST /api/v1/zk/verify/batch
router.post('/verify/batch', validateBatch, adminOnlyMw, zkVerifyLimiter, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const results = await batchVerifyProofs(req.body.items)
  res.json({ success: true, data: results })
}))

// POST /api/v1/zk/proof
// Moved from /api/v1/auth/zk-proof so the URL surface matches
// PROJECT_STRUCTURE.md (one /api/v1/zk router instead of an endpoint
// tucked under /auth). The handler shape, body, and response contract
// are unchanged.
//
// `verifyRateLimit` keys by JWT user id (any authenticated caller can
// hit this); it's separate from `zkVerifyLimiter` so an honest user
// generating their own proofs isn't quota-coupled to admin-side
// verification traffic.
router.post('/proof', verifyRateLimit, validateProof, requireAnyAuthMw, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
  const result = await generateZKProof({
    identityCommitment: req.body.identityCommitment,
    nullifier: req.body.nullifier,
  })
  res.json({ success: true, data: { proofHash: result.proofHash, proof: result.proof } })
}))

export default router
