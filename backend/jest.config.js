/**
 * Jest config for backend integration tests.
 *
 * Uses the `ts-jest` preset so `.ts` test files are compiled with our
 * project's `tsconfig.json`. We pin the test environment to `node`
 * (the rate-limit integration test boots an Express app via supertest
 * and connects to a real Redis, not jsdom).
 *
 * `testMatch` restricts the run to files under `src/__tests__/` so we
 * don't accidentally pick up build artefacts in `dist/`.
 *
 * The 15s test timeout is generous because the rate-limit test
 * connects to Redis, flushes keys, and walks through several request
 * cycles; we want a clear failure instead of a false-positive pass
 * on a slow CI host.
 */
module.exports = {
  // `isolatedModules: true` tells ts-jest to transpile each file in
  // isolation (delegating the project's full type-check to `tsc --noEmit`
  // / the editor). This is necessary because the project currently
  // has 3 known pre-existing tsc errors in `config/redis.ts` (2) and
  // `services/socketService.ts` (1) that are NOT in the test path but
  // would otherwise cause ts-jest's project-wide type-check to bail
  // and report "0 tests executed" before the rate-limit test even
  // starts. With isolated modules, the test file transpiles on its
  // own; the real type-check is run by the build pipeline (`npm run
  // build` -> `tsc`), not by `npm test`.
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  // Map the `@/foo -> src/foo` alias declared in `tsconfig.json` so
  // jest can resolve modules like `@/utils/logger` (used transitively
  // by `config/redis.ts` which the test file imports). Without this,
  // the test fails with `Cannot find module '@/utils/logger' from
  // 'src/config/redis.ts'` the moment jest tries to load the chain.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  testTimeout: 15000,
}
