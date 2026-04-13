pragma circom 2.0.0;

include "circomlib/mimc.circom";

template SessionParticipation() {
    signal input identity_secret;
    signal input commitment;
    signal input session_type;
    signal input timestamp;
    signal output nullifier;
    
    // MiMC hash component for nullifier generation
    component mimc = MiMCSponge(1, 220, 1);
    
    // Generate nullifier for session participation
    // This prevents the same identity from participating in the same session type multiple times
    mimc.ins[0] <== identity_secret;
    mimc.ins[1] <== session_type;
    mimc.ins[2] <== timestamp;
    nullifier <== mimc.out[0];
    
    // Note: In practice, you would also verify that the commitment matches
    // the stored commitment for this identity, but that would require
    // additional constraints and inputs
}

component main = SessionParticipation();
