import express, { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { connectRedis, disconnectRedis, getRedisClient } from '../config/redis'
import {
  perUserRateLimit,
  authRateLimit,
} from '../middleware/rateLimit'

/**
 * Build a minimal Express app that simulates a JWT-authenticated user
 * by setting `req.user.userId` via a stub middleware. The limiter is
 * applied to /probe, and the handler returns 200.
 *
 * If `userId` is omitted, the stub middleware leaves `req.user`
 * undefined, exercising the IP-fallback path in the keyGenerator.
 */
function makeApp(opts: {
  userId?: string
  limiter: express.RequestHandler
}): express.Express {
  const app = express()
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (opts.userId !== undefined) {
      // The production route chain (`requireAuth` -> `getAuthUser`)
      // populates `req.user` from a verified JWT. For the rate-limit
      // stub we only need the `userId` slice, so we type the local
      // shape explicitly and intersect with the strict Express type.
      const userReq = req as Request & { user?: { userId: string } }
      userReq.user = { userId: opts.userId }
    }
    next()
  })
  app.get('/probe', opts.limiter, (_req: Request, res: Response) => {
    res.json({ ok: true })
  })
  return app
}

/**
 * Wipe any rate-limit keys left over from a prior test run so each
 * case starts from a clean Redis namespace.
 */
async function flushTestKeys(): Promise<void> {
  const client = getRedisClient()
  const keys = await client.keys('rl:*')
  if (keys.length > 0) await client.del(...keys)
}

describe('perUserRateLimit (Redis-backed)', () => {
  beforeAll(async () => {
    // Use a dedicated Redis DB so we never collide with the dev /
    // prod data on the same instance.
    process.env.REDIS_DB = '15'
    await connectRedis()
    await flushTestKeys()
  })

  afterAll(async () => {
    try {
      await flushTestKeys()
    } finally {
      await disconnectRedis()
    }
  })

  beforeEach(async () => {
    await flushTestKeys()
  })

  it('allows `max` requests then 429s the (max+1)th with the standard JSON body and Retry-After header', async () => {
    const limiter = perUserRateLimit({
      name: 'test-trigger',
      windowMs: 60_000,
      max: 3,
    })
    const app = makeApp({ userId: 'alice', limiter })

    // First 3 requests should be 200 with draft-7 standard headers.
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/probe')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(res.headers['ratelimit']).toBeDefined()
      expect(res.headers['ratelimit-policy']).toBeDefined()
    }

    // The 4th request must be throttled.
    const throttled = await request(app).get('/probe')
    expect(throttled.status).toBe(429)
    expect(throttled.body).toEqual({
      success: false,
      error: expect.stringContaining('Too many requests for "test-trigger"'),
    })
    expect(throttled.headers['retry-after']).toBeDefined()
  })

  it('isolates quotas per user (same limiter, different userIds)', async () => {
    const limiter = perUserRateLimit({
      name: 'test-user-iso',
      windowMs: 60_000,
      max: 2,
    })
    const appAlice = makeApp({ userId: 'alice', limiter })
    const appBob = makeApp({ userId: 'bob', limiter })

    // Alice burns her quota.
    expect((await request(appAlice).get('/probe')).status).toBe(200)
    expect((await request(appAlice).get('/probe')).status).toBe(200)
    expect((await request(appAlice).get('/probe')).status).toBe(429)

    // Bob is unaffected by Alice's traffic.
    expect((await request(appBob).get('/probe')).status).toBe(200)
    expect((await request(appBob).get('/probe')).status).toBe(200)
    expect((await request(appBob).get('/probe')).status).toBe(429)
  })

  it('isolates quotas per limiter name (same user, different buckets)', async () => {
    const limiterA = perUserRateLimit({
      name: 'bucket-a',
      windowMs: 60_000,
      max: 1,
    })
    const limiterB = perUserRateLimit({
      name: 'bucket-b',
      windowMs: 60_000,
      max: 1,
    })

    const appA = makeApp({ userId: 'eve', limiter: limiterA })
    const appB = makeApp({ userId: 'eve', limiter: limiterB })

    // Eve exhausts bucket-a.
    expect((await request(appA).get('/probe')).status).toBe(200)
    expect((await request(appA).get('/probe')).status).toBe(429)

    // bucket-b is independent: Eve gets a fresh quota there.
    expect((await request(appB).get('/probe')).status).toBe(200)
  })

  it('falls back to IP key when req.user is undefined', async () => {
    const limiter = perUserRateLimit({
      name: 'test-ip',
      windowMs: 60_000,
      max: 2,
    })
    // No auth-stub middleware: req.user is undefined, so the keyer
    // falls back to the IP path.
    const app = express()
    app.get('/probe', limiter, (_req, res) => {
      res.json({ ok: true })
    })

    expect((await request(app).get('/probe')).status).toBe(200)
    expect((await request(app).get('/probe')).status).toBe(200)
    expect((await request(app).get('/probe')).status).toBe(429)
  })

  it('the pre-built authRateLimit is a working RequestHandler (smoke)', async () => {
    // Smoke: the exported limiter is a function with the right shape
    // and can be mounted on a route. We don't burn its 10-req budget
    // here; we just confirm the wiring doesn't throw.
    expect(typeof authRateLimit).toBe('function')
    const app = makeApp({ userId: 'smoke', limiter: authRateLimit })
    const res = await request(app).get('/probe')
    expect([200, 429]).toContain(res.status)
    // Whichever way the response went, draft-7 headers should be
    // emitted (express-rate-limit always sets them on every request).
    expect(res.headers['ratelimit']).toBeDefined()
  })
})
