/**
 * Minimal ambient type stub for `snarkjs`. The npm package `snarkjs@^0.7`
 * ships very thin types; we expand them here so strict TypeScript can
 * resolve calls like `groth16.verify(vk, publicSignals, proof)` and
 * `groth16.fullProve(input, wasm, zkey)`.
 *
 * Replace with the package's own bundled d.ts once we adopt a newer
 * snarkjs release (or write tests against the real binding).
 */
declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: [string, string, string]
    pi_b: [[string, string], [string, string], [string, string]]
    pi_c: [string, string, string]
    protocol: string
    curve: string
  }

  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ) => Promise<{ proof: Groth16Proof; publicSignals: string[] }>
    verify: (
      verificationKey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ) => Promise<boolean>
  }
}
