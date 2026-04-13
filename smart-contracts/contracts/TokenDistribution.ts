use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec, Map, symbol};
use soroban_sdk::token::{TokenClient};

// Contract for managing platform token distribution and rewards
#[contract]
pub struct TokenDistribution {
    // Token address for the platform token
    token_address: Address,
    // User address -> Balance
    balances: Map<Address, u128>,
    // User address -> Staked amount
    stakes: Map<Address, u128>,
    // User address -> Reward points
    reward_points: Map<Address, u128>,
    // Total supply
    total_supply: u128,
    // Admin address
    admin: Address,
    // Reward rate (points per session)
    reward_rate: u128,
}

#[contracttype]
pub struct RewardClaim {
    pub user: Address,
    pub amount: u128,
    pub reason: RewardReason,
    pub timestamp: u64,
    pub session_id: Option<u64>,
}

#[contracttype]
pub enum RewardReason {
    SessionCompleted,
    SessionProvided,
    PositiveReview,
    Referral,
    StakingReward,
    CommunityContribution,
}

#[contracttype]
pub struct StakeInfo {
    pub user: Address,
    pub amount: u128,
    pub staked_at: u64,
    pub lock_period: u64, // in seconds
    pub rewards_earned: u128,
}

#[contractimpl]
impl TokenDistribution {
    // Initialize the contract
    pub fn __init(env: Env, token_address: Address, admin: Address, total_supply: u128, reward_rate: u128) {
        let contract = TokenDistribution {
            token_address,
            balances: Map::new(env),
            stakes: Map::new(env),
            reward_points: Map::new(env),
            total_supply,
            admin,
            reward_rate,
        };
        
        env.storage().instance().set(&contract);
    }

    // Mint tokens to user (admin only)
    pub fn mint(env: Env, to: Address, amount: u128) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        if caller != contract.admin {
            panic!("Only admin can mint tokens");
        }

        if contract.total_supply + amount > 1000000000 * 10000000 { // Max 1 billion tokens (7 decimals)
            panic!("Exceeds maximum supply");
        }

        let token_client = TokenClient::new(&env, &contract.token_address);
        token_client.mint(&to, &amount);

        // Update balance
        let current_balance = contract.balances.get(&to).unwrap_or(0);
        let mut updated_contract = contract;
        updated_contract.balances.set(to, current_balance + amount);
        updated_contract.total_supply += amount;
        env.storage().instance().set(&updated_contract);

        env.events().publish(
            (symbol_short!("TOKENS_MINTED"), 
            (to, amount)
        );
    }

    // Stake tokens
    pub fn stake(env: Env, amount: u128, lock_period_days: u32) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let current_balance = contract.balances.get(&caller).unwrap_or(0);
        if current_balance < amount {
            panic!("Insufficient balance");
        }

        // Transfer tokens to contract
        let token_client = TokenClient::new(&env, &contract.token_address);
        token_client.transfer(&caller, &env.current_contract_address(), &amount);

        // Update stake
        let current_stake = contract.stakes.get(&caller).unwrap_or(0);
        let mut updated_contract = contract;
        updated_contract.stakes.set(caller.clone(), current_stake + amount);
        updated_contract.balances.set(caller, current_balance - amount);

        // Create stake record
        let stake_info = StakeInfo {
            user: caller.clone(),
            amount,
            staked_at: env.ledger().timestamp(),
            lock_period: (lock_period_days as u64) * 86400, // Convert to seconds
            rewards_earned: 0,
        };

        env.events().publish(
            (symbol_short!("TOKENS_STAKED"), 
            (caller, amount, lock_period_days)
        );
    }

    // Unstake tokens
    pub fn unstake(env: Env, amount: u128) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let current_stake = contract.stakes.get(&caller).unwrap_or(0);
        if current_stake < amount {
            panic!("Insufficient staked amount");
        }

        // Transfer tokens back to user
        let token_client = TokenClient::new(&env, &contract.token_address);
        token_client.transfer(&env.current_contract_address(), &caller, &amount);

        // Update stake
        let mut updated_contract = contract;
        updated_contract.stakes.set(caller.clone(), current_stake - amount);
        
        let current_balance = updated_contract.balances.get(&caller).unwrap_or(0);
        updated_contract.balances.set(caller, current_balance + amount);

        env.events().publish(
            (symbol_short!("TOKENS_UNSTAKED"), 
            (caller, amount)
        );
    }

    // Add reward points
    pub fn add_reward_points(env: Env, user: Address, points: u128, reason: RewardReason, session_id: Option<u64>) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can add rewards
        if caller != contract.admin {
            panic!("Only admin can add rewards");
        }

        let current_points = contract.reward_points.get(&user).unwrap_or(0);
        let mut updated_contract = contract;
        updated_contract.reward_points.set(user.clone(), current_points + points);

        // Create reward claim record
        let claim = RewardClaim {
            user: user.clone(),
            amount: points,
            reason,
            timestamp: env.ledger().timestamp(),
            session_id,
        };

        env.events().publish(
            (symbol_short!("REWARDS_ADDED"), 
            (user, points)
        );
    }

    // Claim rewards
    pub fn claim_rewards(env: Env, amount: u128) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let current_points = contract.reward_points.get(&caller).unwrap_or(0);
        if current_points < amount {
            panic!("Insufficient reward points");
        }

        // Calculate token amount (1 point = 1 token)
        let token_amount = amount;

        // Mint tokens to user
        let token_client = TokenClient::new(&env, &contract.token_address);
        token_client.mint(&caller, &token_amount);

        // Update reward points and balance
        let mut updated_contract = contract;
        updated_contract.reward_points.set(caller.clone(), current_points - amount);
        
        let current_balance = updated_contract.balances.get(&caller).unwrap_or(0);
        updated_contract.balances.set(caller, current_balance + token_amount);
        updated_contract.total_supply += token_amount;

        env.storage().instance().set(&updated_contract);

        env.events().publish(
            (symbol_short!("REWARDS_CLAIMED"), 
            (caller, token_amount)
        );
    }

    // Distribute session rewards
    pub fn distribute_session_rewards(env: Env, session_id: u64, patient: Address, provider: Address) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can distribute rewards
        if caller != contract.admin {
            panic!("Only admin can distribute rewards");
        }

        // Add rewards to both patient and provider
        Self::add_reward_points(env, patient, contract.reward_rate, RewardReason::SessionCompleted, Some(session_id));
        Self::add_reward_points(env, provider, contract.reward_rate * 2, RewardReason::SessionProvided, Some(session_id));

        env.events().publish(
            (symbol_short!("SESSION_REWARDS_DISTRIBUTED"), 
            (session_id, patient, provider)
        );
    }

    // Get user balance
    pub fn get_balance(env: Env, user: Address) -> u128 {
        let contract = Self::get_contract(env);
        contract.balances.get(&user).unwrap_or(0)
    }

    // Get user stake
    pub fn get_stake(env: Env, user: Address) -> u128 {
        let contract = Self::get_contract(env);
        contract.stakes.get(&user).unwrap_or(0)
    }

    // Get user reward points
    pub fn get_reward_points(env: Env, user: Address) -> u128 {
        let contract = Self::get_contract(env);
        contract.reward_points.get(&user).unwrap_or(0)
    }

    // Get total supply
    pub fn get_total_supply(env: Env) -> u128 {
        let contract = Self::get_contract(env);
        contract.total_supply
    }

    // Get contract info
    pub fn get_contract_info(env: Env) -> (Address, Address, u128, u128) {
        let contract = Self::get_contract(env);
        (contract.token_address, contract.admin, contract.total_supply, contract.reward_rate)
    }

    // Update reward rate (admin only)
    pub fn update_reward_rate(env: Env, new_rate: u128) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        if caller != contract.admin {
            panic!("Only admin can update reward rate");
        }

        let mut updated_contract = contract;
        updated_contract.reward_rate = new_rate;
        env.storage().instance().set(&updated_contract);

        env.events().publish(
            (symbol_short!("REWARD_RATE_UPDATED"), 
            (new_rate)
        );
    }

    // Helper functions
    fn get_contract(env: Env) -> TokenDistribution {
        env.storage().instance().get::<TokenDistribution>().unwrap()
    }
}
