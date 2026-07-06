import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import { asyncHandler } from '@/middleware/errorHandler'
import { authRateLimit } from '@/middleware/rateLimit'
import { loginUser, registerUser, refreshToken } from '@/services/authService'

const router = Router()

// Validation middleware
const validateRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('publicKey').isLength({ min: 56, max: 56 }),
  body('role').isIn(['PATIENT', 'PROVIDER']),
  body('firstName').trim().isLength({ min: 1, max: 50 }),
  body('lastName').trim().isLength({ min: 1, max: 50 }),
]

const validateLogin = [
  body('publicKey').isLength({ min: 56, max: 56 }),
  body('signature').isLength({ min: 130, max: 132 }),
]

// Register new user
//
// `authRateLimit` runs FIRST as the route-level guard. Because this route
// is unauthenticated the keyer falls back to IP — that's intentional: a
// single attacker IP can't enumerate accounts / brute-force credentials
// on behalf of a legitimate user.
router.post('/register', authRateLimit, validateRegistration, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    })
  }

  const { email, publicKey, role, firstName, lastName } = req.body
  const result = await registerUser({ email, publicKey, role, profile: { firstName, lastName } })

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken
    }
  })
}))

// Login user
//
// Same IP-fallback behavior as /register: limits login brute force from
// a single attacker IP without throttling legitimate unrelated traffic.
router.post('/login', authRateLimit, validateLogin, asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    })
  }

  const { publicKey, signature } = req.body
  const result = await loginUser({ publicKey, signature })

  res.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken
    }
  })
}))

// Refresh token
//
// IP-keyed since no JWT is in play here. Stops refresh-token replay
// storms from a single IP without affecting other unrelated users.
router.post('/refresh', authRateLimit, asyncHandler(async (req, res) => {
  const { refreshToken: refreshTokenJwt } = req.body
  const result = await refreshToken(refreshTokenJwt)

  res.json({
    success: true,
    data: {
      token: result.token,
      refreshToken: result.refreshToken
    }
  })
}))
export default router
