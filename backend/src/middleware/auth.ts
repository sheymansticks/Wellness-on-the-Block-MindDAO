import { Request, RequestHandler } from 'express'
import { verifyToken, TokenPayload } from '@/services/authService'
import { asyncHandler } from '@/middleware/errorHandler'

// Augment Express's Request globally so `req.user` is available everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload
    }
  }
}

export type Role = 'PATIENT' | 'PROVIDER' | 'ADMIN'

/**
 * Handler helper: reads Authorization header, verifies the bearer token, and
 * returns the decoded payload. Throws a 401-shaped error that the global
 * errorHandler converts to a JSON response.
 */
export async function getAuthUser(req: Request): Promise<TokenPayload> {
  if (req.user) return req.user
  const header = req.header('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) {
    const err: Error & { statusCode?: number } = new Error('Missing or malformed Authorization header')
    err.statusCode = 401
    throw err
  }
  const payload = await verifyToken(match[1])
  req.user = payload
  return payload
}

/**
 * Express middleware: verify a JWT bearer token without role gating.
 *
 * Use on endpoints that any authenticated caller can hit. The decoded
 * payload is cached on `req.user`, so the next `getAuthUser(req)` call
 * in the handler returns synchronously from memory. Throws a 401-shaped
 * error if the token is missing, malformed, or expired.
 */
export function requireAuth(): RequestHandler {
  return asyncHandler(async (req: Request, _res, next) => {
    await getAuthUser(req)
    next()
  })
}

/**
 * Express middleware: require an authenticated caller whose role is in the
 * allow-list. Admins are always permitted regardless of order. Use this
 * factory for both role-specific and admin-only routes.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  const allow = new Set<string>(allowed)
  return asyncHandler(async (req: Request, _res, next) => {
    const user = await getAuthUser(req)
    if (user.role !== 'ADMIN' && !allow.has(user.role)) {
      const err: Error & { statusCode?: number } = new Error(
        `Forbidden: role ${user.role} not allowed (need one of: ${[...allow].join(', ')})`,
      )
      err.statusCode = 403
      throw err
    }
    next()
  })
}

/** Convenience: ADMIN-only express middleware. */
export const adminOnly = (): RequestHandler => requireRole('ADMIN')
