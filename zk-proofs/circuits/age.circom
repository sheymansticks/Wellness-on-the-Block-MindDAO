pragma circom 2.0.0;

include "circomlib/mimc.circom";
include "circomlib/comparators.circom";

template AgeVerification() {
    signal input identity_secret;
    signal input age;
    signal input min_age;
    signal output commitment;
    
    // MiMC hash component for commitment
    component mimc = MiMCSponge(1, 220, 1);
    
    // Age verification component
    component ageCheck = GreaterEqThan(8);
    
    // Calculate commitment (hash of identity secret and age)
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== age;
    commitment <== mimc.out[0];
    
    // Verify that age meets minimum requirement
    ageCheck.in[0] <== age;
    ageCheck.in[1] <== min_age;
    ageCheck.out === 1;
}

component main = AgeVerification();
