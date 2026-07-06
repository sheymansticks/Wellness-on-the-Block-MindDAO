/**
 * Canonical SnarkJS groth16 output shapes.
 *
 * Both shapes mirror the JSON exports produced by `snarkjs zkey export
 * verificationkey` and `groth16.fullProve`. Keeping them in a dedicated
 * file lets every consumer (circuits, verifier, server) drop the
 * historical `any` annotations without each side defining its own.
 */
export interface SnarkJsProof {
  /** A = [Ax, Ay, Az] (G1 points encoded as decimal strings). */
  pi_a: [string, string, string]
  /** B = [[Bx0, Bx1], [By0, By1], [Bz0, Bz1]] (G2 points). */
  pi_b: [
    [string, string],
    [string, string],
    [string, string],
  ]
  /** C = [Cx, Cy, Cz] (G1 points). */
  pi_c: [string, string, string]
  protocol: string
  curve: string
}

export interface SnarkJsVerificationKey {
  vk_alpha_1: [string, string, string]
  vk_beta_2: [
    [string, string],
    [string, string],
  ]
  vk_gamma_2: [
    [string, string],
    [string, string],
  ]
  vk_delta_2: [
    [string, string],
    [string, string],
  ]
  IC: string[][]
}

export interface ZKProofBundle {
  proof: SnarkJsProof
  publicSignals: string[]
}
