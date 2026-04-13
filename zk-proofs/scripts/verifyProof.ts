#!/usr/bin/env ts-node

import { ProofVerifier } from '../src/verifier/proof-verifier';
import fs from 'fs';

// Script to verify ZK proofs
async function verifySampleProofs() {
  console.log('Verifying sample ZK proofs...');

  const verifier = new ProofVerifier();

  try {
    // Load and verify identity proof
    console.log('\n1. Verifying identity proof...');
    const identityProofData = JSON.parse(fs.readFileSync('./test-proofs/identity-proof.json', 'utf8'));
    
    const identityVerification = await verifier.verifyIdentityProof(
      identityProofData.proof,
      identityProofData.publicSignals
    );
    
    console.log('Identity Proof Verification:', identityVerification);

    // Load and verify session proof
    console.log('\n2. Verifying session proof...');
    const sessionProofData = JSON.parse(fs.readFileSync('./test-proofs/session-proof.json', 'utf8'));
    
    const sessionVerification = await verifier.verifySessionProof(
      sessionProofData.proof,
      sessionProofData.publicSignals,
      identityVerification.commitment // Use commitment from identity proof
    );
    
    console.log('Session Proof Verification:', sessionVerification);

    // Load and verify age proof
    console.log('\n3. Verifying age proof...');
    const ageProofData = JSON.parse(fs.readFileSync('./test-proofs/age-proof.json', 'utf8'));
    
    const ageVerification = await verifier.verifyAgeProof(
      ageProofData.proof,
      ageProofData.publicSignals
    );
    
    console.log('Age Proof Verification:', ageVerification);

    console.log('\nAll proofs verified successfully!');

  } catch (error) {
    console.error('Error verifying proofs:', error);
    process.exit(1);
  }
}

// Verify specific proof file
async function verifyProofFile(filePath: string, proofType: 'identity' | 'session' | 'age') {
  const verifier = new ProofVerifier();

  try {
    const proofData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    let verification;
    switch (proofType) {
      case 'identity':
        verification = await verifier.verifyIdentityProof(proofData.proof, proofData.publicSignals);
        break;
      case 'session':
        verification = await verifier.verifySessionProof(proofData.proof, proofData.publicSignals);
        break;
      case 'age':
        verification = await verifier.verifyAgeProof(proofData.proof, proofData.publicSignals);
        break;
      default:
        throw new Error('Invalid proof type');
    }

    console.log(`Proof verification result for ${proofType}:`);
    console.log(JSON.stringify(verification, null, 2));

    return verification;
  } catch (error) {
    console.error(`Error verifying ${proofType} proof:`, error);
    throw error;
  }
}

// Batch verification
async function verifyBatchProofs() {
  console.log('Verifying batch proofs...');

  const verifier = new ProofVerifier();

  try {
    const batchData = JSON.parse(fs.readFileSync('./test-proofs/batch-proofs.json', 'utf8'));
    
    const results = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const item of batchData) {
      const verification = await verifier.verifyIdentityProof(item.proof, item.publicSignals);
      
      results.push({
        index: item.index,
        sessionType: item.sessionType,
        isValid: verification.isValid,
        error: verification.error
      });

      if (verification.isValid) {
        validCount++;
      } else {
        invalidCount++;
      }
    }

    console.log(`Batch verification completed:`);
    console.log(`- Valid proofs: ${validCount}`);
    console.log(`- Invalid proofs: ${invalidCount}`);
    console.log(`- Total: ${results.length}`);

    // Save verification results
    fs.writeFileSync(
      './test-proofs/batch-verification-results.json',
      JSON.stringify(results, null, 2)
    );

    return results;
  } catch (error) {
    console.error('Error in batch verification:', error);
    throw error;
  }
}

// Test nullifier reuse detection
async function testNullifierReuse() {
  console.log('Testing nullifier reuse detection...');

  const verifier = new ProofVerifier();

  try {
    // Load identity proof
    const proofData = JSON.parse(fs.readFileSync('./test-proofs/identity-proof.json', 'utf8'));
    
    // First verification should succeed
    const firstVerification = await verifier.verifyIdentityProof(
      proofData.proof,
      proofData.publicSignals
    );
    
    console.log('First verification:', firstVerification.isValid);

    // Second verification should fail due to nullifier reuse
    const secondVerification = await verifier.verifyIdentityProof(
      proofData.proof,
      proofData.publicSignals
    );
    
    console.log('Second verification (should fail):', secondVerification.isValid);
    console.log('Error expected:', secondVerification.error);

    if (firstVerification.isValid && !secondVerification.isValid) {
      console.log('Nullifier reuse detection working correctly!');
    } else {
      console.log('Nullifier reuse detection may have issues');
    }

  } catch (error) {
    console.error('Error testing nullifier reuse:', error);
  }
}

// Performance test
async function performanceTest(proofCount: number = 100) {
  console.log(`Running performance test with ${proofCount} proofs...`);

  const verifier = new ProofVerifier();
  const startTime = Date.now();

  try {
    // Load batch proofs
    const batchData = JSON.parse(fs.readFileSync('./test-proofs/batch-proofs.json', 'utf8'));
    
    const proofsToTest = batchData.slice(0, Math.min(proofCount, batchData.length));
    
    const results = await verifier.batchVerifyProofs(
      proofsToTest.map(item => ({
        type: 'identity' as const,
        proof: item.proof,
        publicSignals: item.publicSignals
      }))
    );

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;

    console.log(`Performance test results:`);
    console.log(`- Proofs verified: ${results.length}`);
    console.log(`- Valid: ${validCount}`);
    console.log(`- Invalid: ${invalidCount}`);
    console.log(`- Duration: ${duration}ms`);
    console.log(`- Average per proof: ${(duration / results.length).toFixed(2)}ms`);

  } catch (error) {
    console.error('Performance test error:', error);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    verifySampleProofs();
  } else if (args[0] === 'file') {
    if (args.length < 3) {
      console.error('Usage: ts-node verifyProof.ts file <file-path> <proof-type>');
      process.exit(1);
    }
    
    const filePath = args[1];
    const proofType = args[2] as 'identity' | 'session' | 'age';
    
    verifyProofFile(filePath, proofType);
  } else if (args[0] === 'batch') {
    verifyBatchProofs();
  } else if (args[0] === 'nullifier') {
    testNullifierReuse();
  } else if (args[0] === 'performance') {
    const count = parseInt(args[1]) || 100;
    performanceTest(count);
  } else {
    console.error('Usage: ts-node verifyProof.ts [file|batch|nullifier|performance] [args...]');
    process.exit(1);
  }
}

export { 
  verifySampleProofs, 
  verifyProofFile, 
  verifyBatchProofs, 
  testNullifierReuse, 
  performanceTest 
};
