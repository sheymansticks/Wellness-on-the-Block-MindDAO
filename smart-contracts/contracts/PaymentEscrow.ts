use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec, Map, symbol};
use soroban_sdk::crypto::sha256;
use soroban_sdk::token::{TokenClient, StellarAssetClient};

// Contract for managing payment escrow for wellness sessions
#[contract]
pub struct PaymentEscrow {
    // Session ID -> Escrow details
    escrows: Map<u64, EscrowDetails>,
    // User address -> Total escrowed amount
    user_balances: Map<Address, i128>,
    // Platform fee percentage (in basis points, e.g., 250 = 2.5%)
    platform_fee_bps: u32,
    // Admin address for contract management
    admin: Address,
}

#[contracttype]
pub struct EscrowDetails {
    pub session_id: u64,
    pub payer: Address,
    pub provider: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub deadline: u64,
    pub dispute_deadline: u64,
}

#[contracttype]
pub enum EscrowStatus {
    Created,
    Funded,
    SessionStarted,
    SessionCompleted,
    Released,
    Refunded,
    Disputed,
    DisputeResolved,
}

#[contractimpl]
impl PaymentEscrow {
    // Initialize the contract
    pub fn __init(env: Env, admin: Address, platform_fee_bps: u32) {
        if platform_fee_bps > 1000 {
            panic!("Platform fee cannot exceed 10%");
        }
        
        let contract = PaymentEscrow {
            escrows: Map::new(env),
            user_balances: Map::new(env),
            platform_fee_bps,
            admin,
        };
        
        env.storage().instance().set(&contract);
    }

    // Create a new escrow for a session
    pub fn create_escrow(
        env: Env,
        session_id: u64,
        provider: Address,
        amount: i128,
        currency: Symbol,
        duration_hours: u64,
    ) -> u64 {
        let contract = Self::get_contract(env);
        let payer = env.invoker();

        // Validate inputs
        Self::validate_create_escrow(env, &contract, session_id, &payer, &provider, amount, duration_hours);

        let escrow = EscrowDetails {
            session_id,
            payer: payer.clone(),
            provider,
            amount,
            currency,
            status: EscrowStatus::Created,
            created_at: env.ledger().timestamp(),
            deadline: env.ledger().timestamp() + (duration_hours * 3600),
            dispute_deadline: env.ledger().timestamp() + (duration_hours * 3600 * 2), // 2x session duration
        };

        contract.escrows.set(session_id, escrow);
        env.events().publish(
            (symbol_short!("ESCROW_CREATED"), 
            (session_id, payer, amount, currency)
        );

        session_id
    }

    // Fund an escrow (transfer tokens to contract)
    pub fn fund_escrow(env: Env, session_id: u64, amount: i128) {
        let contract = Self::get_contract(env);
        let payer = env.invoker();

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Verify caller is the payer
        if escrow.payer != payer {
            panic!("Only the payer can fund the escrow");
        }

        // Verify amount matches expected
        if escrow.amount != amount {
            panic!("Amount does not match expected escrow amount");
        }

        // Transfer tokens to contract
        let token_client = TokenClient::new(&env, &escrow.currency);
        token_client.transfer(&payer, &env.current_contract_address(), &amount);

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::Funded;
        contract.escrows.set(session_id, updated_escrow);

        // Update user balance
        let current_balance = contract.user_balances.get(payer.clone()).unwrap_or(0);
        contract.user_balances.set(payer, current_balance + amount);

        env.events().publish(
            (symbol_short!("ESCROW_FUNDED"), 
            (session_id, amount)
        );
    }

    // Start session (provider confirms session has begun)
    pub fn start_session(env: Env, session_id: u64) {
        let contract = Self::get_contract(env);
        let provider = env.invoker();

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Verify caller is the provider
        if escrow.provider != provider {
            panic!("Only the provider can start the session");
        }

        // Verify escrow is funded
        if escrow.status != EscrowStatus::Funded {
            panic!("Escrow must be funded before starting session");
        }

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::SessionStarted;
        contract.escrows.set(session_id, updated_escrow);

        env.events().publish(
            (symbol_short!("SESSION_STARTED"), 
            (session_id, provider)
        );
    }

    // Complete session and release payment to provider
    pub fn complete_session(env: Env, session_id: u64) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Only provider or admin can complete session
        if escrow.provider != caller && caller != contract.admin {
            panic!("Only provider or admin can complete session");
        }

        // Verify session is started
        if escrow.status != EscrowStatus::SessionStarted {
            panic!("Session must be started before completion");
        }

        // Calculate platform fee and provider payment
        let platform_fee = (escrow.amount * contract.platform_fee_bps as i128) / 10000;
        let provider_payment = escrow.amount - platform_fee;

        // Transfer payment to provider
        let token_client = TokenClient::new(&env, &escrow.currency);
        token_client.transfer(&env.current_contract_address(), &escrow.provider, &provider_payment);

        // Transfer platform fee to admin
        if platform_fee > 0 {
            token_client.transfer(&env.current_contract_address(), &contract.admin, &platform_fee);
        }

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::Released;
        contract.escrows.set(session_id, updated_escrow);

        // Update user balance
        let current_balance = contract.user_balances.get(escrow.payer.clone()).unwrap_or(0);
        contract.user_balances.set(escrow.payer, current_balance - escrow.amount);

        env.events().publish(
            (symbol_short!("SESSION_COMPLETED"), 
            (session_id, escrow.provider, provider_payment, platform_fee)
        );
    }

    // Refund escrow back to payer
    pub fn refund_escrow(env: Env, session_id: u64) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Only admin or payer (after deadline) can refund
        let current_time = env.ledger().timestamp();
        let can_refund = caller == contract.admin || 
                         (escrow.payer == caller && current_time > escrow.deadline);

        if !can_refund {
            panic!("Cannot refund escrow");
        }

        // Transfer full amount back to payer
        let token_client = TokenClient::new(&env, &escrow.currency);
        token_client.transfer(&env.current_contract_address(), &escrow.payer, &escrow.amount);

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::Refunded;
        contract.escrows.set(session_id, updated_escrow);

        // Update user balance
        let current_balance = contract.user_balances.get(escrow.payer.clone()).unwrap_or(0);
        contract.user_balances.set(escrow.payer, current_balance - escrow.amount);

        env.events().publish(
            (symbol_short!("ESCROW_REFUNDED"), 
            (session_id, escrow.payer, escrow.amount)
        );
    }

    // Dispute an escrow
    pub fn dispute_escrow(env: Env, session_id: u64, reason: String) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Only payer or provider can dispute
        if escrow.payer != caller && escrow.provider != caller {
            panic!("Only payer or provider can dispute");
        }

        // Verify dispute deadline hasn't passed
        let current_time = env.ledger().timestamp();
        if current_time > escrow.dispute_deadline {
            panic!("Dispute deadline has passed");
        }

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::Disputed;
        contract.escrows.set(session_id, updated_escrow);

        env.events().publish(
            (symbol_short!("ESCROW_DISPUTED"), 
            (session_id, caller, reason)
        );
    }

    // Resolve dispute (admin only)
    pub fn resolve_dispute(
        env: Env, 
        session_id: u64, 
        refund_to_payer: bool,
        refund_percentage: u32 // Percentage to refund to payer (0-100)
    ) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin can resolve disputes
        if caller != contract.admin {
            panic!("Only admin can resolve disputes");
        }

        let escrow = match contract.escrows.get(session_id) {
            Some(escrow) => escrow,
            None => panic!("Escrow not found"),
        };

        // Verify escrow is disputed
        if escrow.status != EscrowStatus::Disputed {
            panic!("Escrow must be disputed to resolve");
        }

        let token_client = TokenClient::new(&env, &escrow.currency);
        
        if refund_to_payer {
            // Refund specified percentage to payer
            let refund_amount = (escrow.amount * refund_percentage as i128) / 100;
            token_client.transfer(&env.current_contract_address(), &escrow.payer, &refund_amount);
            
            // Remaining to provider
            let provider_amount = escrow.amount - refund_amount;
            token_client.transfer(&env.current_contract_address(), &escrow.provider, &provider_amount);
        } else {
            // Full payment to provider
            let platform_fee = (escrow.amount * contract.platform_fee_bps as i128) / 10000;
            let provider_payment = escrow.amount - platform_fee;
            
            token_client.transfer(&env.current_contract_address(), &escrow.provider, &provider_payment);
            
            if platform_fee > 0 {
                token_client.transfer(&env.current_contract_address(), &contract.admin, &platform_fee);
            }
        }

        // Update escrow status
        let mut updated_escrow = escrow;
        updated_escrow.status = EscrowStatus::DisputeResolved;
        contract.escrows.set(session_id, updated_escrow);

        env.events().publish(
            (symbol_short!("DISPUTE_RESOLVED"), 
            (session_id, refund_to_payer, refund_percentage)
        );
    }

    // Helper functions
    fn get_contract(env: Env) -> PaymentEscrow {
        env.storage().instance().get::<PaymentEscrow>().unwrap()
    }

    fn validate_create_escrow(
        env: Env,
        contract: &PaymentEscrow,
        session_id: u64,
        payer: &Address,
        provider: &Address,
        amount: i128,
        duration_hours: u64,
    ) {
        // Check if escrow already exists
        if contract.escrows.contains(session_id) {
            panic!("Escrow already exists for this session");
        }

        // Validate amount
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Validate duration
        if duration_hours == 0 || duration_hours > 168 { // Max 1 week
            panic!("Invalid session duration");
        }

        // Validate addresses are different
        if payer == provider {
            panic!("Payer and provider must be different");
        }
    }

    // View functions
    pub fn get_escrow(env: Env, session_id: u64) -> EscrowDetails {
        let contract = Self::get_contract(env);
        contract.escrows.get(session_id).unwrap_or_else(|| {
            EscrowDetails {
                session_id: 0,
                payer: Address::from_string(&String::from_str(&env, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")),
                provider: Address::from_string(&String::from_str(&env, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")),
                amount: 0,
                currency: symbol_short!("USD"),
                status: EscrowStatus::Created,
                created_at: 0,
                deadline: 0,
                dispute_deadline: 0,
            }
        })
    }

    pub fn get_user_balance(env: Env, user: Address) -> i128 {
        let contract = Self::get_contract(env);
        contract.user_balances.get(user).unwrap_or(0)
    }

    pub fn get_contract_info(env: Env) -> (Address, u32) {
        let contract = Self::get_contract(env);
        (contract.admin, contract.platform_fee_bps)
    }
}
