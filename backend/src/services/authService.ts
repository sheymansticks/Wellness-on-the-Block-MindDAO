import jwt, { SignOptions, Secret } from 'jsonwebtoken'
import { prisma } from '@/config/database'
import { logger } from '@/utils/logger'

// --- JWT configuration -------------------------------------------------------

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'wellness-development-secret-change-in-prod'
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '15m'
const REFRESH_TOKEN_SECRET: Secret =
  process.env.REFRESH_TOKEN_SECRET || 'wellness-refresh-development-secret'
const REFRESH_TOKEN_EXPIRES_IN: string = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'

// --- Public types -----------------------------------------------------------

export interface TokenPayload {
  userId: string
  role: 'PATIENT' | 'PROVIDER' | 'ADMIN'
  publicKey: string
}

export interface RegisterInput {
  email: string
  publicKey: string
  role: 'PATIENT' | 'PROVIDER'
  profile: {
    firstName: string
    lastName: string
  }
}

export interface LoginInput {
  publicKey: string
  /** Base64-encoded stellar signature, 130–132 chars per the route validator. */
  signature: string
}

export interface AuthResult {
  user: {
    id: string
    email: string
    publicKey: string
    role: 'PATIENT' | 'PROVIDER' | 'ADMIN'
    isVerified: boolean
  }
  token: string
  refreshToken: string
}

// --- Helpers ----------------------------------------------------------------

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as SignOptions)
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN } as SignOptions)
}

/**
 * Decode + verify an access token. Throws if signature or expiry fails.
 * Used by middleware (HTTP) and by the Socket.IO handshake.
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
  if (!decoded?.userId || !decoded?.role) {
    throw new Error('Malformed token payload')
  }
  return decoded
}

async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload
  if (!decoded?.userId || !decoded?.role) {
    throw new Error('Malformed refresh token payload')
  }
  return decoded
}

/**
 * Signature verification.
 *
 * ⚠️ STUB — NOT CRYPTOGRAPHICALLY SECURE.
 *
 * Length + format checks only. Replace with real ed25519 verification before
 * any production deployment. Suggested path:
 *   import nacl from 'tweetnacl'
 *   const ok = nacl.sign.detached.verify(msgBytes, sigBytes, publicKeyBytes)
 * The message payload to sign should be a server-supplied nonce (issued via
 *   GET /api/v1/auth/challenge → { nonce, issuedAt } ) signed by the user's
 * Stellar secret key; the server then verifies with the publicKey.
 *
 * This stub will fail closed on obvious garbage and pass equal-length junk,
 * which is acceptable for scaffolding but unacceptable for real auth.
 */
function signatureLooksValid(signature: string, publicKey: string): boolean {
  try {
    const looksHex = /^0x[0-9a-fA-F]{130}$/.test(signature) || /^[0-9a-fA-F]{130}$/.test(signature)
    const looksBase64 = signature.length >= 130 && signature.length <= 200
    const looksStellar = signature.length === 128 // raw ed25519 sig is 64 bytes
    if (!looksHex && !looksBase64 && !looksStellar) return false
    return /^G[A-Z2-7]{55}$/.test(publicKey) || /^[0-9a-fA-F]{56}$/.test(publicKey)
  } catch (err) {
    logger.warn('Signature format check error:', err)
    return false
  }
}

// --- User-facing operations --------------------------------------------------

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const { email, publicKey, role, profile } = input

  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  if (existingByEmail) {
    const err: Error & { statusCode?: number } = new Error('Email already registered')
    err.statusCode = 409
    throw err
  }
  const existingByKey = await prisma.user.findUnique({ where: { publicKey } })
  if (existingByKey) {
    const err: Error & { statusCode?: number } = new Error('Public key already registered')
    err.statusCode = 409
    throw err
  }

  const user = await prisma.user.create({
    data: {
      email,
      publicKey,
      role,
      profile: {
        create: {
          firstName: profile.firstName,
          lastName: profile.lastName,
        },
      },
    },
    include: { profile: true },
  })

  const payload: TokenPayload = { userId: user.id, role: user.role, publicKey: user.publicKey }
  return {
    user: {
      id: user.id,
      email: user.email,
      publicKey: user.publicKey,
      role: user.role,
      isVerified: user.isVerified,
    },
    token: signToken(payload),
    refreshToken: signRefreshToken(payload),
  }
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const { publicKey, signature } = input

  const user = await prisma.user.findUnique({
    where: { publicKey },
    include: { profile: true },
  })
  if (!user) {
    const err: Error & { statusCode?: number } = new Error('User not found')
    err.statusCode = 404
    throw err
  }
  if (!user.isActive) {
    const err: Error & { statusCode?: number } = new Error('Account is deactivated')
    err.statusCode = 403
    throw err
  }
  if (!signatureLooksValid(signature, publicKey)) {
    const err: Error & { statusCode?: number } = new Error('Invalid signature')
    err.statusCode = 401
    throw err
  }

  const payload: TokenPayload = { userId: user.id, role: user.role, publicKey: user.publicKey }
  return {
    user: {
      id: user.id,
      email: user.email,
      publicKey: user.publicKey,
      role: user.role,
      isVerified: user.isVerified,
    },
    token: signToken(payload),
    refreshToken: signRefreshToken(payload),
  }
}

export async function refreshToken(refreshTokenJwt: string): Promise<{ token: string; refreshToken: string }> {
  const payload = await verifyRefreshToken(refreshTokenJwt)

  // Confirm the user still exists and is active
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || !user.isActive) {
    const err: Error & { statusCode?: number } = new Error('User not found or inactive')
    err.statusCode = 401
    throw err
  }

  const fresh: TokenPayload = {
    userId: user.id,
    role: user.role,
    publicKey: user.publicKey,
  }
  return {
    token: signToken(fresh),
    refreshToken: signRefreshToken(fresh),
  }
}


