pragma circom 2.0.0;

include "circomlib/mimc.circom";
include "circomlib/comparators.circom";

template IdentityVerification() {
    signal input identity_secret;
    signal input age;
    signal input profession_verified;
    signal input background_check;
    signal input license_valid;
    signal input min_age;
    signal input session_type;
    signal output commitment;
    signal output nullifier;
    
    // MiMC hash components
    component mimc = MiMCSponge(1, 220, 1);
    component nullifierMimc = MiMCSponge(1, 220, 1);
    
    // Age verification component
    component ageCheck = GreaterEqThan(8);
    
    // Calculate identity commitment
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== age;
    mimc.ins[2] <== profession_verified + background_check + license_valid;
    commitment <== mimc.out[0];
    
    // Verify age requirement
    ageCheck.in[0] <== age;
    ageCheck.in[1] <== min_age;
    ageCheck.out === 1;
    
    // Generate nullifier to prevent double-spending
    nullifierMimc.ins[0] <== identity_secret;
    nullifierMimc.ins[1] <== session_type;
    nullifier <== nullifierMimc.out[0];
}

component main = IdentityVerification();
