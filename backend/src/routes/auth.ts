import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import { asyncHandler } from '@/middleware/errorHandler'
import { loginUser, registerUser, refreshToken } from '@/services/authService'
import { generateZKProof } from '@/services/zkService'

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
router.post('/register', validateRegistration, asyncHandler(async (req, res) => {
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
router.post('/login', validateLogin, asyncHandler(async (req, res) => {
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
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body
  const result = await refreshToken(refreshToken)

  res.json({
    success: true,
    data: {
      token: result.token,
      refreshToken: result.refreshToken
    }
  })
}))

// Generate ZK proof for privacy
router.post('/zk-proof', asyncHandler(async (req, res) => {
  const { identityCommitment, nullifier } = req.body
  const result = await generateZKProof({ identityCommitment, nullifier })

  res.json({
    success: true,
    data: {
      proofHash: result.proofHash,
      proof: result.proof
    }
  })
}))

export default router
