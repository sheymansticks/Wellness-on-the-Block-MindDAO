/**
 * INTENTIONAL LINT VIOLATION DEMO.
 *
 * This file exists solely to verify that the GH Actions `lint-frontend`
 * job catches violations of:
 *   - `@typescript-eslint/no-explicit-any`  (the explicit `: any` annotation
 *                                            on `typedAsAnyIgnored` below)
 *   - `@typescript-eslint/no-unused-vars`   (the unused local constant
 *                                            `unusedInStrictBelow` below)
 *
 * end-to-end via a failing PR. The branch
 * `ci/frontend-deliberate-violation` is not merge-target; DELETE this file
 * (then re-push) before considering merging the branch upstream.
 *
 * The demo names are deliberately chosen so they DO NOT match the existing
 * `varsIgnorePattern: "^_"` exemption; the unused variable will be caught.
 */

/** Intentional demo function. NOT exported into the app graph. */
export function strictLintDemo(): number {
  const typedAsAnyIgnored: any = 42           // triggers no-explicit-any
  const unusedInStrictBelow = typedAsAnyIgnored + 1 // triggers no-unused-vars
  return 7
}
