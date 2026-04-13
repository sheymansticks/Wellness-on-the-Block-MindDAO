#!/usr/bin/env ts-node

import { IdentityCircuit } from '../src/circuits/identity';
import { CryptoUtils } from '../src/utils/crypto';
import { ZK_CONSTANTS } from '../src/utils/crypto';

// Script to generate sample ZK proofs for testing
async function generateSampleProofs() {
  console.log('Generating sample ZK proofs...');

  const identityCircuit = new IdentityCircuit();

  // Sample identity data
  const identitySecret = CryptoUtils.generateIdentitySecret();
  const attributes = {
    age: 30,
    professionVerified: true,
    backgroundCheckPassed: true,
    licenseValid: true
  };

  console.log('Identity Secret:', identitySecret);
  console.log('Attributes:', attributes);

  try {
    // Generate identity verification proof
    console.log('\n1. Generating identity verification proof...');
    const identityProof = await identityCircuit.generateProof(
      identitySecret,
      attributes,
      ZK_CONSTANTS.SESSION_TYPES.THERAPY
    );
    
    console.log('Identity Proof Generated:');
    console.log('- Public Signals:', identityProof.publicSignals);
    console.log('- Proof Size:', JSON.stringify(identityProof.proof).length, 'characters');

    // Generate session participation proof
    console.log('\n2. Generating session participation proof...');
    const commitment = identityProof.publicSignals[0]; // First signal is commitment
    const sessionProof = await identityCircuit.generateSessionProof(
      identitySecret,
      commitment,
      ZK_CONSTANTS.SESSION_TYPES.THERAPY,
      Date.now()
    );
    
    console.log('Session Proof Generated:');
    console.log('- Public Signals:', sessionProof.publicSignals);
    console.log('- Proof Size:', JSON.stringify(sessionProof.proof).length, 'characters');

    // Generate age verification proof
    console.log('\n3. Generating age verification proof...');
    const ageProof = await identityCircuit.generateAgeProof(
      identitySecret,
      attributes.age,
      ZK_CONSTANTS.MIN_AGE
    );
    
    console.log('Age Proof Generated:');
    console.log('- Public Signals:', ageProof.publicSignals);
    console.log('- Proof Size:', JSON.stringify(ageProof.proof).length, 'characters');

    // Save proofs to files for testing
    const fs = require('fs');
    const proofsDir = './test-proofs';
    
    if (!fs.existsSync(proofsDir)) {
      fs.mkdirSync(proofsDir);
    }

    fs.writeFileSync(
      `${proofsDir}/identity-proof.json`,
      JSON.stringify(identityProof, null, 2)
    );
    
    fs.writeFileSync(
      `${proofsDir}/session-proof.json`,
      JSON.stringify(sessionProof, null, 2)
    );
    
    fs.writeFileSync(
      `${proofsDir}/age-proof.json`,
      JSON.stringify(ageProof, null, 2)
    );

    console.log('\nProofs saved to ./test-proofs/ directory');

    // Generate commitment for reference
    const identityCommitment = identityCircuit.generateIdentityCommitment(
      identitySecret,
      attributes
    );
    console.log('\nIdentity Commitment:', identityCommitment);

    // Generate nullifier examples
    const therapyNullifier = identityCircuit.generateNullifier(
      identitySecret,
      ZK_CONSTANTS.SESSION_TYPES.THERAPY
    );
    const counselingNullifier = identityCircuit.generateNullifier(
      identitySecret,
      ZK_CONSTANTS.SESSION_TYPES.COUNSELING
    );
    
    console.log('\nNullifiers:');
    console.log('- Therapy:', therapyNullifier);
    console.log('- Counseling:', counselingNullifier);

    console.log('\nSample proof generation completed successfully!');

  } catch (error) {
    console.error('Error generating proofs:', error);
    process.exit(1);
  }
}

// Generate proof for specific user
async function generateUserProof(
  identitySecret: string,
  attributes: {
    age: number;
    professionVerified: boolean;
    backgroundCheckPassed: boolean;
    licenseValid: boolean;
  },
  sessionType: string
) {
  const identityCircuit = new IdentityCircuit();

  console.log(`Generating proof for ${sessionType} session...`);

  try {
    const proof = await identityCircuit.generateProof(
      identitySecret,
      attributes,
      sessionType
    );

    const signals = identityCircuit.extractPublicSignals(proof);
    
    console.log('Proof Generated Successfully:');
    console.log('- Commitment:', signals.commitment);
    console.log('- Nullifier:', signals.nullifier);
    console.log('- Session Type:', signals.sessionType);
    console.log('- Timestamp:', signals.timestamp);

    return { proof, signals };
  } catch (error) {
    console.error('Error generating user proof:', error);
    throw error;
  }
}

// Batch proof generation for testing
async function generateBatchProofs(count: number = 10) {
  console.log(`Generating ${count} batch proofs...`);
  
  const identityCircuit = new IdentityCircuit();
  const proofs = [];

  for (let i = 0; i < count; i++) {
    const identitySecret = CryptoUtils.generateIdentitySecret();
    const attributes = {
      age: CryptoUtils.secureRandom(18, 65),
      professionVerified: Math.random() > 0.3,
      backgroundCheckPassed: Math.random() > 0.2,
      licenseValid: Math.random() > 0.4
    };

    const sessionTypes = Object.values(ZK_CONSTANTS.SESSION_TYPES);
    const sessionType = sessionTypes[Math.floor(Math.random() * sessionTypes.length)];

    try {
      const proof = await identityCircuit.generateProof(
        identitySecret,
        attributes,
        sessionType
      );
      
      proofs.push({
        index: i,
        identitySecret,
        attributes,
        sessionType,
        proof,
        signals: identityCircuit.extractPublicSignals(proof)
      });

      console.log(`Generated proof ${i + 1}/${count}`);
    } catch (error) {
      console.error(`Failed to generate proof ${i + 1}:`, error);
    }
  }

  // Save batch proofs
  const fs = require('fs');
  fs.writeFileSync(
    './test-proofs/batch-proofs.json',
    JSON.stringify(proofs, null, 2)
  );

  console.log(`Batch generation completed. ${proofs.length} proofs saved.`);
  return proofs;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    generateSampleProofs();
  } else if (args[0] === 'batch') {
    const count = parseInt(args[1]) || 10;
    generateBatchProofs(count);
  } else if (args[0] === 'user') {
    if (args.length < 3) {
      console.error('Usage: ts-node generateProof.ts user <identity-secret> <session-type>');
      process.exit(1);
    }
    
    const identitySecret = args[1];
    const sessionType = args[2];
    
    generateUserProof(identitySecret, {
      age: 30,
      professionVerified: true,
      backgroundCheckPassed: true,
      licenseValid: true
    }, sessionType);
  } else {
    console.error('Usage: ts-node generateProof.ts [batch|user] [args...]');
    process.exit(1);
  }
}

export { generateSampleProofs, generateUserProof, generateBatchProofs };
