import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import { getRedisClient } from '@/config/redis'

export interface PerUserRateLimitOpts {
  /**
   * Short label included in the 429 message and bolted onto the fallback
   * IP-key so different limit buckets never collide in Redis.
   */
  name: string
  /** Sliding-window length in milliseconds. */
  windowMs: number
  /** Max requests per `windowMs` per user. */
  max: number
}

/**
 * Shared Redis-backed store for all per-user rate limiters. Constructed
 * LAZILY on first use (NOT at module load) so that:
 *
 *   1. Importing the limiters (e.g. `import { authRateLimit } from
 *      '@/middleware/rateLimit'`) does NOT touch Redis. The store's
 *      internal `init()` runs `KEYS rl:*` to check the prefix; if that
 *      fires during module load in a context where `connectRedis()`
 *      has not yet been called (integration tests, route imports at
 *      `server.ts` setup time), `getRedisClient()` throws and the
 *      init fails before any request ever hits the limiter.
 *      (This invariant is upheld by `lazyLimiter` further below --
 *      without that wrapper the prebuilt exports would re-introduce a
 *      module-load-time store init and contradict this comment.)
 *   2. `sendCommand` is resolved LAZILY at request time, because
 *      `getRedisClient()` throws if `connectRedis()` hasn't run yet.
 *      `server.ts` calls `setupRoutes(app)` synchronously at module
 *      load and `await connectRedis()` later inside `startServer()`,
 *      so by the time a request hits the limiter, Redis is connected.
 *   3. ioredis exposes `client.call(cmd, ...args)`, which is the
 *      drop-in equivalent of node-redis v4's `client.sendCommand(args)`.
 *      We forward rate-limit-redis's command tuple through `call`.
 *   4. The single shared store namespaces per-limiter via the
 *      `keyGenerator` (the `name` suffix is unique per limiter), so
 *      all five pre-built limiters reuse this one instance.
 *
 * Failure semantics (intentional, fail-closed):
 *   We do NOT use `passOnStoreError: true` -- that option was added in
 *   `express-rate-limit@7+` and we are on `6.x`. When Redis is
 *   unreachable the sendCommand throws, express-rate-limit's store
 *   throws, the global errorHandler converts to a 500. That is the
 *   explicit cross-process-consistency choice: a Redis outage should
 *   be visible, not papered over by per-process memory. To enable
 *   fail-open behavior later, upgrade express-rate-limit and flip the
 *   option.
 */
let _redisStore: RedisStore | null = null
function getRedisStore(): RedisStore {
  if (_redisStore) return _redisStore
  _redisStore = new RedisStore({
    prefix: 'rl:',
    sendCommand: ((...args: string[]): Promise<boolean | number | string | (boolean | number | string)[]> => {
      const client = getRedisClient()
      return client.call(args[0], ...args.slice(1)) as Promise<boolean | number | string | (boolean | number | string)[]>
    }),
  })
  return _redisStore
}

/**
 * Express middleware factory: per-authenticated-user rate limiter, keyed by
 * `req.user.userId` (which the JWT middleware populates once `requireAuth()`
 * or `requireRole(...)` has run).
 *
 * - Falls back to `ip:<addr>:<name>` if the limiter runs before any auth
 *   middleware sets `req.user`. (For our protected routes that shouldn't
 *   happen, but it keeps the limiter robust against ordering mistakes.)
 * - Backed by Redis (via the shared `redisStore`) so quotas are
 *   consistent across multiple backend processes. The keyer namespaces
 *   per-limiter, so a user can exhaust the zk-verify bucket without
 *   affecting their payment-release bucket.
 *
 * Response shape:
 *   429 + `Retry-After` header + `{ success: false, error }` body.
 */
export function perUserRateLimit(opts: PerUserRateLimitOpts): RateLimitRequestHandler {
  const { name, windowMs, max } = opts
  return rateLimit({
    windowMs,
    max,
    store: getRedisStore(),
    // `standardHeaders: 'draft-7'` emits RFC-6585 + draft-7 headers
    // (`RateLimit`, `RateLimit-Policy`, `Retry-After`). `legacyHeaders`
    // disabled so we don't leak the old `X-RateLimit-*` triple.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const uid = req.user?.userId
      return uid ? `u:${uid}:${name}` : `ip:${req.ip ?? 'unknown'}:${name}`
    },
    message: {
      success: false,
      error: `Too many requests for "${name}". Please slow down and retry.`,
    },
    statusCode: 429,
  })
}

/**
 * Wrap a `perUserRateLimit(...)` invocation in a lazy delegate so the
 * underlying `rateLimit({store, ...})` middleware (which synchronously
 * triggers `store.init()` on construction — and `RedisStore.init()` calls
 * `sendCommand('KEYS rl:*')` immediately) does NOT fire at module-load
 * time.
 *
 * The pre-built limiters below are imported by `routes/*` and `server.ts`
 * at boot, and by the integration test BEFORE `beforeAll(async () =>
 * connectRedis())` has run. Without this lazy wrapper, importing the
 * limiters throws "Redis client not initialized" because
 * `getRedisClient()` is called before `connectRedis()`. By wrapping each
 * construction in a thin RequestHandler that builds the limiter on the
 * first HTTP request, the Redis access happens after `connectRedis()`
 * guarantees the client is ready.
 *
 * Concurrency: Node's single-threaded JS dispatch serializes the
 * `if (!built) built = perUserRateLimit(opts)` check, so the returned
 * delegate is built at most once per process — no race against parallel
 * requests sharing the same prebuilt export.
 *
 * `.resetKey` is forwarded (and lazily built too) so the wrapper
 * continues to satisfy `RateLimitRequestHandler`'s hybrid
 * function-with-`resetKey` structural shape.
 */
function lazyLimiter(opts: PerUserRateLimitOpts): RateLimitRequestHandler {
  let built: RateLimitRequestHandler | null = null
  const handler: RateLimitRequestHandler = (req, res, next) => {
    if (!built) built = perUserRateLimit(opts)
    return built(req, res, next)
  }
  handler.resetKey = (key: string) => {
    if (!built) built = perUserRateLimit(opts)
    built.resetKey(key)
  }
  return handler
}

/* ------------------------------------------------------------------ */
/* Pre-built limiters for routes flagged as expensive.                 */
/* ------------------------------------------------------------------ */

/**
 * zk-SNARK verification is CPU-heavy. Limit ADMIN verifiers to 20
 * verifications / minute / user. The handler chain is
 * `validateVerify -> adminOnlyMw -> zkVerifyLimiter -> asyncHandler`,
 * so the limiter keys off the JWT subject and isn't reachable by
 * anonymous traffic.
 */
export const zkVerifyLimiter = lazyLimiter({
  name: 'zk-verify',
  windowMs: 60 * 1000,
  max: 20,
})

/**
 * Payment release fans out to the on-chain PaymentEscrow contract and is
 * the gating operation for fund movement. 30 / minute / user is
 * generous for legitimate re-tries but still defends against a runaway
 * script.
 */
export const paymentReleaseLimiter = lazyLimiter({
  name: 'payment-release',
  windowMs: 60 * 1000,
  max: 30,
})

/**
 * zk-proof generation (`/api/v1/zk/proof`): any authenticated caller can
 * ask for a fresh proof-hash index entry. This is keyed by JWT user id
 * because the route sits behind `requireAnyAuthMw`. 60 / minute / user
 * is generous (proofs are cheap; the user shouldn't generate more than
 * one a second outside bulk scripts).
 */
export const verifyRateLimit = lazyLimiter({
  name: 'zk-proof-gen',
  windowMs: 60 * 1000,
  max: 60,
})

/**
 * Auth surface (`/auth/register`, `/auth/login`, `/auth/refresh`).
 * These routes are NOT behind the JWT middleware so `req.user` is
 * undefined and the keyer's graceful IP-fallback kicks in, which is
 * exactly the behavior we want for brute-force defense: a single
 * attacker IP can't overwhelm a legitimate user's auth flow. 10 / min /
 * IP is tight enough to defeat credential stuffing without annoying
 * users who mistype a password twice.
 */
export const authRateLimit = lazyLimiter({
  name: 'auth',
  windowMs: 60 * 1000,
  max: 10,
})

/**
 * Provider write surface:
 *   - `POST /providers/register` (self-onboarding)
 *   - `PUT  /providers/:id`        (profile edits)
 *   - `PUT  /providers/:id/availability` (schedule edits)
 *   - `POST /providers/:id/verify` (admin scoring/verification)
 *
 * The /verify route is admin-only; the others are provider-only. Either
 * way, by the time the limiter runs `req.user.userId` is populated by
 * the upstream role guard, so the keyer is per-user. 30 / minute / user
 * is generous on profile updates (real providers iterate a few times
 * during onboarding) but still bounds runaway scripts.
 */
export const providerWriteLimiter = lazyLimiter({
  name: 'provider-write',
  windowMs: 60 * 1000,
  max: 30,
})
