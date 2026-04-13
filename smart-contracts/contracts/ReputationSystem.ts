use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec, Map, symbol};

// Contract for managing on-chain reputation scores
#[contract]
pub struct ReputationSystem {
    // User address -> Reputation data
    reputations: Map<Address, Reputation>,
    // Identity commitment -> Reputation data (for privacy)
    anonymous_reputations: Map<String, Reputation>,
    // Admin address
    admin: Address,
    // Reputation decay rate (in basis points per month)
    decay_rate_bps: u32,
}

#[contracttype]
pub struct Reputation {
    pub score: u32,           // 0-1000 (100.0%)
    pub total_sessions: u32,
    pub successful_sessions: u32,
    pub disputed_sessions: u32,
    pub cancelled_sessions: u32,
    pub positive_reviews: u32,
    pub negative_reviews: u32,
    pub last_updated: u64,
    pub verification_level: u8, // 0-4
    pub streak_days: u32,
    pub monthly_sessions: u32,
}

#[contracttype]
pub struct ReputationUpdate {
    pub user_address: Address,
    pub identity_commitment: Option<String>,
    pub session_completed: bool,
    pub session_cancelled: bool,
    pub dispute_raised: bool,
    pub dispute_won: bool,
    pub review_positive: Option<bool>,
    pub verification_level: u8,
}

#[contracttype]
pub struct LeaderboardEntry {
    pub address: Address,
    pub score: u32,
    pub total_sessions: u32,
    pub success_rate: u32,
    pub verification_level: u8,
}

#[contractimpl]
impl ReputationSystem {
    // Initialize the contract
    pub fn __init(env: Env, admin: Address, decay_rate_bps: u32) {
        if decay_rate_bps > 1000 {
            panic!("Decay rate cannot exceed 10%");
        }
        
        let contract = ReputationSystem {
            reputations: Map::new(env),
            anonymous_reputations: Map::new(env),
            admin,
            decay_rate_bps,
        };
        
        env.storage().instance().set(&contract);
    }

    // Create or update reputation for a user
    pub fn create_reputation(env: Env, user_address: Address, identity_commitment: String) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can create reputations
        if caller != contract.admin {
            panic!("Only admin can create reputations");
        }

        let reputation = Reputation {
            score: 500, // Start at 50.0%
            total_sessions: 0,
            successful_sessions: 0,
            disputed_sessions: 0,
            cancelled_sessions: 0,
            positive_reviews: 0,
            negative_reviews: 0,
            last_updated: env.ledger().timestamp(),
            verification_level: 0,
            streak_days: 0,
            monthly_sessions: 0,
        };

        contract.reputations.set(user_address.clone(), reputation.clone());
        contract.anonymous_reputations.set(identity_commitment, reputation);

        env.events().publish(
            (symbol_short!("REPUTATION_CREATED"), 
            (user_address, 500)
        );
    }

    // Update reputation based on session outcome
    pub fn update_reputation(env: Env, update: ReputationUpdate) -> u32 {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can update reputations
        if caller != contract.admin {
            panic!("Only admin can update reputations");
        }

        let mut reputation = if let Some(identity_commitment) = update.identity_commitment {
            contract.anonymous_reputations.get(&identity_commitment).unwrap()
        } else {
            contract.reputations.get(&update.user_address).unwrap()
        };

        // Update session counts
        reputation.total_sessions += 1;
        reputation.monthly_sessions += 1;

        if update.session_completed {
            reputation.successful_sessions += 1;
            reputation.streak_days += 1;
            
            // Increase score for completed session
            reputation.score = reputation.score.saturating_add(20);
        }

        if update.session_cancelled {
            reputation.cancelled_sessions += 1;
            reputation.streak_days = 0;
            
            // Decrease score for cancellation
            reputation.score = reputation.score.saturating_sub(30);
        }

        if update.dispute_raised {
            reputation.disputed_sessions += 1;
            
            // Small penalty for raising dispute
            reputation.score = reputation.score.saturating_sub(10);
        }

        if update.dispute_won {
            // Bonus for winning dispute
            reputation.score = reputation.score.saturating_add(15);
        }

        if let Some(review_positive) = update.review_positive {
            if review_positive {
                reputation.positive_reviews += 1;
                reputation.score = reputation.score.saturating_add(10);
            } else {
                reputation.negative_reviews += 1;
                reputation.score = reputation.score.saturating_sub(20);
            }
        }

        // Update verification level
        if update.verification_level > reputation.verification_level {
            reputation.verification_level = update.verification_level;
            reputation.score = reputation.score.saturating_add(50); // Bonus for verification
        }

        // Apply monthly decay if needed
        Self::apply_monthly_decay(&mut reputation, contract.decay_rate_bps);

        // Ensure score stays within bounds (0-1000)
        reputation.score = reputation.score.max(0).min(1000);

        reputation.last_updated = env.ledger().timestamp();

        // Update both reputation stores
        if let Some(identity_commitment) = update.identity_commitment {
            contract.anonymous_reputations.set(identity_commitment, reputation.clone());
        }
        contract.reputations.set(update.user_address, reputation.clone());

        env.events().publish(
            (symbol_short!("REPUTATION_UPDATED"), 
            (update.user_address, reputation.score)
        );

        reputation.score
    }

    // Get reputation score
    pub fn get_reputation(env: Env, user_address: Address) -> Reputation {
        let contract = Self::get_contract(env);
        contract.reputations.get(&user_address).unwrap_or_else(|| {
            Reputation {
                score: 0,
                total_sessions: 0,
                successful_sessions: 0,
                disputed_sessions: 0,
                cancelled_sessions: 0,
                positive_reviews: 0,
                negative_reviews: 0,
                last_updated: 0,
                verification_level: 0,
                streak_days: 0,
                monthly_sessions: 0,
            }
        })
    }

    // Get anonymous reputation score
    pub fn get_anonymous_reputation(env: Env, identity_commitment: String) -> Reputation {
        let contract = Self::get_contract(env);
        contract.anonymous_reputations.get(&identity_commitment).unwrap_or_else(|| {
            Reputation {
                score: 0,
                total_sessions: 0,
                successful_sessions: 0,
                disputed_sessions: 0,
                cancelled_sessions: 0,
                positive_reviews: 0,
                negative_reviews: 0,
                last_updated: 0,
                verification_level: 0,
                streak_days: 0,
                monthly_sessions: 0,
            }
        })
    }

    // Get leaderboard (top providers by reputation)
    pub fn get_leaderboard(env: Env, limit: u32) -> Vec<LeaderboardEntry> {
        let contract = Self::get_contract(env);
        let mut leaderboard = Vec::new(&env);

        // Collect all reputations
        for (address, reputation) in contract.reputations.iter() {
            let success_rate = if reputation.total_sessions > 0 {
                (reputation.successful_sessions * 100) / reputation.total_sessions
            } else {
                0
            };

            let entry = LeaderboardEntry {
                address,
                score: reputation.score,
                total_sessions: reputation.total_sessions,
                success_rate,
                verification_level: reputation.verification_level,
            };
            leaderboard.push_back(entry);
        }

        // Sort by score (descending) - simplified for Soroban
        // In production, implement proper sorting algorithm
        leaderboard
    }

    // Reset monthly session counts (called monthly)
    pub fn reset_monthly_sessions(env: Env) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can reset monthly sessions
        if caller != contract.admin {
            panic!("Only admin can reset monthly sessions");
        }

        for (_, mut reputation) in contract.reputations.iter() {
            reputation.monthly_sessions = 0;
            // Apply monthly decay
            Self::apply_monthly_decay(&mut reputation, contract.decay_rate_bps);
        }

        env.events().publish(
            (symbol_short!("MONTHLY_RESET"), 
            (env.ledger().timestamp())
        );
    }

    // Helper functions
    fn get_contract(env: Env) -> ReputationSystem {
        env.storage().instance().get::<ReputationSystem>().unwrap()
    }

    fn apply_monthly_decay(reputation: &mut Reputation, decay_rate_bps: u32) {
        // Apply decay based on monthly sessions
        if reputation.monthly_sessions == 0 {
            // No activity this month, apply decay
            let decay_amount = (reputation.score * decay_rate_bps as u32) / 10000;
            reputation.score = reputation.score.saturating_sub(decay_amount);
            reputation.streak_days = 0;
        }
    }

    // Get contract info
    pub fn get_contract_info(env: Env) -> (Address, u32) {
        let contract = Self::get_contract(env);
        (contract.admin, contract.decay_rate_bps)
    }
}
