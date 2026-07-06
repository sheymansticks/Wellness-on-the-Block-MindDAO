import express, { Request, Response, NextFunction } from 'express'
import request from 'supertest'

// Mock the authService module BEFORE importing the middleware. Jest
// hoists this `jest.mock(...)` call above the imports below, so the
// middleware's `import { verifyToken } from '@/services/authService'`
// resolves to our `jest.fn()` rather than the real JWT verifier.
jest.mock('../services/authService', () => ({
  verifyToken: jest.fn(),
}))

import { verifyToken } from '../services/authService'
import {
  requireAuth,
  requireRole,
  adminOnly,
  getAuthUser,
  Role,
} from '../middleware/auth'
import { errorHandler } from '../middleware/errorHandler'

const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>

/**
 * Build a minimal Express app with the given middleware stack and a
 * stub handler. The `errorHandler` is included (the real one, not a
 * mock) so 401/403 responses match the production JSON shape:
 *   `{ success: false, error }`.
 */
function makeApp(
  stack: express.RequestHandler[],
  handler: (req: Request, res: Response) => void = (_req, res) => {
    res.json({ ok: true })
  },
): express.Express {
  const app = express()
  app.get('/probe', ...stack, handler)
  app.use(errorHandler)
  return app
}

/**
 * Cast helper: a TokenPayload carries more fields (iat, exp) than the
 * tests care about. We construct a minimal payload and cast through
 * `unknown` to keep the production type signature while only filling
 * the bits the middleware actually reads (userId + role).
 */
function payload(userId: string, role: Role): unknown {
  return { userId, role }
}

beforeEach(() => {
  mockedVerifyToken.mockReset()
})

/* ------------------------------------------------------------------ */
/* requireAuth                                                          */
/* ------------------------------------------------------------------ */

describe('requireAuth', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const app = makeApp([requireAuth()])
    const res = await request(app).get('/probe')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/Missing or malformed/i)
  })

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const app = makeApp([requireAuth()])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'NotBearer abc')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Missing or malformed/i)
    // verifyToken must NOT be called when the header shape is wrong
    expect(mockedVerifyToken).not.toHaveBeenCalled()
  })

  it('returns 401 when verifyToken rejects (invalid/expired token)', async () => {
    // The real `verifyToken` in `services/authService.ts` throws a
    // 401-shaped error on bad/expired JWTs (sets `statusCode: 401`).
    // The middleware just propagates whatever `verifyToken` throws,
    // and the global `errorHandler` then maps `statusCode` to the
    // response status. A bare Error without `statusCode` would fall
    // through to 500, so we mirror the production contract here.
    const jwtErr = Object.assign(new Error('jwt expired'), { statusCode: 401 })
    mockedVerifyToken.mockRejectedValue(jwtErr)
    const app = makeApp([requireAuth()])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer stale-token')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/jwt expired/i)
    expect(mockedVerifyToken).toHaveBeenCalledWith('stale-token')
  })

  it('returns 200 on a valid token and populates req.user for the handler', async () => {
    mockedVerifyToken.mockResolvedValue(payload('alice', 'PATIENT') as any)
    const app = makeApp(
      [requireAuth()],
      (req, res) => {
        // The global Request augmentation puts `user` on every request.
        res.json({ ok: true, userId: req.user?.userId, role: req.user?.role })
      },
    )
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer good-token')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, userId: 'alice', role: 'PATIENT' })
  })
})

/* ------------------------------------------------------------------ */
/* requireRole                                                          */
/* ------------------------------------------------------------------ */

describe('requireRole', () => {
  it('returns 401 on a missing token (auth runs before role check)', async () => {
    const app = makeApp([requireRole('PROVIDER', 'ADMIN')])
    const res = await request(app).get('/probe')
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user role is not in the allow list', async () => {
    mockedVerifyToken.mockResolvedValue(payload('alice', 'PATIENT') as any)
    const app = makeApp([requireRole('PROVIDER', 'ADMIN')])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer patient-token')
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/Forbidden.*PATIENT/)
  })

  it('returns 200 when the user role is in the allow list', async () => {
    mockedVerifyToken.mockResolvedValue(payload('bob', 'PROVIDER') as any)
    const app = makeApp([requireRole('PROVIDER', 'ADMIN')])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer provider-token')
    expect(res.status).toBe(200)
  })

  it('always allows ADMIN even if ADMIN is not in the allow list', async () => {
    mockedVerifyToken.mockResolvedValue(payload('eve', 'ADMIN') as any)
    // ADMIN is intentionally NOT in the allow list; the middleware
    // should still pass the request through (escape hatch).
    const app = makeApp([requireRole('PROVIDER')])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
  })

  it('returns 200 for a multi-role allow list when the user has any of the roles', async () => {
    mockedVerifyToken.mockResolvedValue(payload('alice', 'PATIENT') as any)
    const app = makeApp([requireRole('PATIENT', 'PROVIDER', 'ADMIN')])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer patient-token')
    expect(res.status).toBe(200)
  })
})

/* ------------------------------------------------------------------ */
/* adminOnly                                                            */
/* ------------------------------------------------------------------ */

describe('adminOnly', () => {
  it('returns 403 for a PATIENT', async () => {
    mockedVerifyToken.mockResolvedValue(payload('alice', 'PATIENT') as any)
    const app = makeApp([adminOnly()])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer patient-token')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/PATIENT/)
  })

  it('returns 403 for a PROVIDER', async () => {
    mockedVerifyToken.mockResolvedValue(payload('bob', 'PROVIDER') as any)
    const app = makeApp([adminOnly()])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer provider-token')
    expect(res.status).toBe(403)
  })

  it('returns 200 for an ADMIN', async () => {
    mockedVerifyToken.mockResolvedValue(payload('eve', 'ADMIN') as any)
    const app = makeApp([adminOnly()])
    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
  })
})

/* ------------------------------------------------------------------ */
/* getAuthUser (handler helper, with caching)                           */
/* ------------------------------------------------------------------ */

describe('getAuthUser', () => {
  it('caches the verified payload on req.user so a second call is a cache hit', async () => {
    let verifyCalls = 0
    mockedVerifyToken.mockImplementation(async () => {
      verifyCalls++
      return payload('alice', 'PATIENT') as any
    })

    const app = express()
    app.get(
      '/probe',
      requireAuth(),
      async (req: Request, res: Response, _next: NextFunction) => {
        // Two back-to-back calls in the same handler.
        const u1 = await getAuthUser(req)
        const u2 = await getAuthUser(req)
        res.json({ ok: true, sameRef: u1 === u2, verifyCalls })
      },
    )
    app.use(errorHandler)

    const res = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer good-token')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // Both `getAuthUser` calls return the SAME payload reference
    // (cached on req.user), and `verifyToken` was only called once.
    expect(res.body.sameRef).toBe(true)
    expect(res.body.verifyCalls).toBe(1)
  })
})
