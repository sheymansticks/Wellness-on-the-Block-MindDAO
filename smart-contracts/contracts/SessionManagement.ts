use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec, Map, symbol};

// Contract for managing wellness sessions on-chain
#[contract]
pub struct SessionManagement {
    // Session ID -> Session data
    sessions: Map<u64, Session>,
    // Provider address -> Available session slots
    provider_slots: Map<Address, ProviderSlots>,
    // User address -> Active sessions
    user_sessions: Map<Address, Vec<u64>>,
    // Session counter for unique IDs
    session_counter: u64,
    // Admin address
    admin: Address,
}

#[contracttype]
pub struct Session {
    pub id: u64,
    pub patient: Address,
    pub provider: Address,
    pub service_type: ServiceType,
    pub status: SessionStatus,
    pub scheduled_time: u64,
    pub duration_minutes: u32,
    pub price: u64,
    pub currency: Symbol,
    pub meeting_link: String,
    pub is_anonymous: bool,
    pub zk_proof_hash: Option<String>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub notes: String,
}

#[contracttype]
pub struct ProviderSlots {
    pub provider: Address,
    pub available_slots: Vec<TimeSlot>,
    pub booked_slots: Vec<TimeSlot>,
    pub timezone: String,
    pub buffer_minutes: u32,
}

#[contracttype]
pub struct TimeSlot {
    pub start_time: u64,
    pub end_time: u64,
    pub session_type: ServiceType,
    pub price: u64,
    pub currency: Symbol,
}

#[contracttype]
pub enum ServiceType {
    Therapy,
    Counseling,
    Psychiatry,
    LifeCoaching,
}

#[contracttype]
pub enum SessionStatus {
    Scheduled,
    Confirmed,
    InProgress,
    Completed,
    Cancelled,
    NoShow,
    Disputed,
}

#[contractimpl]
impl SessionManagement {
    // Initialize the contract
    pub fn __init(env: Env, admin: Address) {
        let contract = SessionManagement {
            sessions: Map::new(env),
            provider_slots: Map::new(env),
            user_sessions: Map::new(env),
            session_counter: 0,
            admin,
        };
        
        env.storage().instance().set(&contract);
    }

    // Register provider availability
    pub fn register_provider_slots(
        env: Env,
        provider: Address,
        slots: Vec<TimeSlot>,
        timezone: String,
        buffer_minutes: u32,
    ) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only admin or provider can register slots
        if caller != contract.admin && caller != provider {
            panic!("Only admin or provider can register slots");
        }

        let provider_data = ProviderSlots {
            provider: provider.clone(),
            available_slots: slots,
            booked_slots: Vec::new(&env),
            timezone,
            buffer_minutes,
        };

        contract.provider_slots.set(provider, provider_data);

        env.events().publish(
            (symbol_short!("PROVIDER_SLOTS_REGISTERED"), 
            (provider, slots.len())
        );
    }

    // Create a new session
    pub fn create_session(
        env: Env,
        patient: Address,
        provider: Address,
        service_type: ServiceType,
        scheduled_time: u64,
        duration_minutes: u32,
        is_anonymous: bool,
        zk_proof_hash: Option<String>,
    ) -> u64 {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        // Only patient or admin can create sessions
        if caller != patient && caller != contract.admin {
            panic!("Only patient or admin can create sessions");
        }

        // Generate unique session ID
        let session_id = contract.session_counter + 1;

        // Validate provider availability
        let provider_data = contract.provider_slots.get(&provider).unwrap();
        if !Self::is_slot_available(&provider_data, scheduled_time, duration_minutes) {
            panic!("Requested time slot is not available");
        }

        // Get price from available slot
        let price = Self::get_slot_price(&provider_data, scheduled_time, service_type);

        let session = Session {
            id: session_id,
            patient: patient.clone(),
            provider: provider.clone(),
            service_type,
            status: SessionStatus::Scheduled,
            scheduled_time,
            duration_minutes,
            price,
            currency: symbol_short!("USD"),
            meeting_link: String::from_str(&env, ""),
            is_anonymous,
            zk_proof_hash,
            created_at: env.ledger().timestamp(),
            started_at: None,
            completed_at: None,
            notes: String::from_str(&env, ""),
        };

        // Update session counter
        let mut updated_contract = contract;
        updated_contract.session_counter = session_id;

        // Store session
        updated_contract.sessions.set(session_id, session.clone());

        // Update provider slots (move slot to booked)
        Self::book_provider_slot(&mut updated_contract, provider, scheduled_time, duration_minutes);

        // Update user sessions
        let mut user_sessions = contract.user_sessions.get(&patient).unwrap_or(Vec::new(&env));
        user_sessions.push_back(session_id);
        updated_contract.user_sessions.set(patient, user_sessions);

        // Save updated contract
        env.storage().instance().set(&updated_contract);

        env.events().publish(
            (symbol_short!("SESSION_CREATED"), 
            (session_id, patient, provider)
        );

        session_id
    }

    // Confirm a session (after payment)
    pub fn confirm_session(env: Env, session_id: u64) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let mut session = contract.sessions.get(&session_id).unwrap();

        // Only provider or admin can confirm
        if caller != session.provider && caller != contract.admin {
            panic!("Only provider or admin can confirm session");
        }

        if session.status != SessionStatus::Scheduled {
            panic!("Session must be scheduled to confirm");
        }

        session.status = SessionStatus::Confirmed;
        contract.sessions.set(session_id, session);

        env.events().publish(
            (symbol_short!("SESSION_CONFIRMED"), 
            (session_id, session.provider)
        );
    }

    // Start a session
    pub fn start_session(env: Env, session_id: u64, meeting_link: String) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let mut session = contract.sessions.get(&session_id).unwrap();

        // Only provider can start session
        if caller != session.provider {
            panic!("Only provider can start session");
        }

        if session.status != SessionStatus::Confirmed {
            panic!("Session must be confirmed to start");
        }

        let current_time = env.ledger().timestamp();
        if current_time < session.scheduled_time - 300 { // 5 minutes early max
            panic!("Cannot start session more than 5 minutes early");
        }

        session.status = SessionStatus::InProgress;
        session.started_at = Some(current_time);
        session.meeting_link = meeting_link;
        contract.sessions.set(session_id, session);

        env.events().publish(
            (symbol_short!("SESSION_STARTED"), 
            (session_id, session.meeting_link)
        );
    }

    // Complete a session
    pub fn complete_session(env: Env, session_id: u64, notes: String) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let mut session = contract.sessions.get(&session_id).unwrap();

        // Only provider can complete session
        if caller != session.provider {
            panic!("Only provider can complete session");
        }

        if session.status != SessionStatus::InProgress {
            panic!("Session must be in progress to complete");
        }

        session.status = SessionStatus::Completed;
        session.completed_at = Some(env.ledger().timestamp());
        session.notes = notes;
        contract.sessions.set(session_id, session);

        env.events().publish(
            (symbol_short!("SESSION_COMPLETED"), 
            (session_id, session.provider)
        );
    }

    // Cancel a session
    pub fn cancel_session(env: Env, session_id: u64, reason: String) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let mut session = contract.sessions.get(&session_id).unwrap();

        // Only patient, provider, or admin can cancel
        if caller != session.patient && caller != session.provider && caller != contract.admin {
            panic!("Only participant or admin can cancel session");
        }

        if session.status == SessionStatus::Completed || session.status == SessionStatus::Cancelled {
            panic!("Cannot cancel completed or already cancelled session");
        }

        session.status = SessionStatus::Cancelled;
        session.notes = reason;
        contract.sessions.set(session_id, session);

        // Release the slot back to available
        Self::release_provider_slot(&mut contract, session.provider, session.scheduled_time, session.duration_minutes);

        env.events().publish(
            (symbol_short!("SESSION_CANCELLED"), 
            (session_id, caller)
        );
    }

    // Mark no-show
    pub fn mark_no_show(env: Env, session_id: u64) {
        let contract = Self::get_contract(env);
        let caller = env.invoker();

        let mut session = contract.sessions.get(&session_id).unwrap();

        // Only provider can mark no-show
        if caller != session.provider {
            panic!("Only provider can mark no-show");
        }

        if session.status != SessionStatus::Confirmed {
            panic!("Session must be confirmed to mark no-show");
        }

        let current_time = env.ledger().timestamp();
        let session_end = session.scheduled_time + (session.duration_minutes as u64 * 60);
        
        if current_time < session_end {
            panic!("Cannot mark no-show before session end time");
        }

        session.status = SessionStatus::NoShow;
        contract.sessions.set(session_id, session);

        env.events().publish(
            (symbol_short!("SESSION_NO_SHOW"), 
            (session_id, session.patient)
        );
    }

    // Get session details
    pub fn get_session(env: Env, session_id: u64) -> Session {
        let contract = Self::get_contract(env);
        contract.sessions.get(&session_id).unwrap_or_else(|| {
            Session {
                id: 0,
                patient: Address::from_string(&String::from_str(&env, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")),
                provider: Address::from_string(&String::from_str(&env, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")),
                service_type: ServiceType::Therapy,
                status: SessionStatus::Scheduled,
                scheduled_time: 0,
                duration_minutes: 0,
                price: 0,
                currency: symbol_short!("USD"),
                meeting_link: String::from_str(&env, ""),
                is_anonymous: false,
                zk_proof_hash: None,
                created_at: 0,
                started_at: None,
                completed_at: None,
                notes: String::from_str(&env, ""),
            }
        })
    }

    // Get user sessions
    pub fn get_user_sessions(env: Env, user: Address) -> Vec<u64> {
        let contract = Self::get_contract(env);
        contract.user_sessions.get(&user).unwrap_or(Vec::new(&env))
    }

    // Get provider slots
    pub fn get_provider_slots(env: Env, provider: Address) -> ProviderSlots {
        let contract = Self::get_contract(env);
        contract.provider_slots.get(&provider).unwrap_or_else(|| {
            ProviderSlots {
                provider,
                available_slots: Vec::new(&env),
                booked_slots: Vec::new(&env),
                timezone: String::from_str(&env, "UTC"),
                buffer_minutes: 15,
            }
        })
    }

    // Helper functions
    fn get_contract(env: Env) -> SessionManagement {
        env.storage().instance().get::<SessionManagement>().unwrap()
    }

    fn is_slot_available(provider_data: &ProviderSlots, start_time: u64, duration: u32) -> bool {
        let end_time = start_time + (duration as u64 * 60);
        
        for slot in provider_data.available_slots.iter() {
            if slot.start_time <= start_time && slot.end_time >= end_time {
                return true;
            }
        }
        false
    }

    fn get_slot_price(provider_data: &ProviderSlots, start_time: u64, service_type: ServiceType) -> u64 {
        for slot in provider_data.available_slots.iter() {
            if slot.start_time <= start_time && slot.end_time >= start_time + 3600 {
                if slot.session_type == service_type {
                    return slot.price;
                }
            }
        }
        1000000 // Default price (1 USD in cents)
    }

    fn book_provider_slot(contract: &mut SessionManagement, provider: Address, start_time: u64, duration: u32) {
        let mut provider_data = contract.provider_slots.get(&provider).unwrap();
        let end_time = start_time + (duration as u64 * 60);

        // Find and move the slot to booked
        let mut slot_to_book = None;
        let mut slot_index = 0;

        for (i, slot) in provider_data.available_slots.iter().enumerate() {
            if slot.start_time <= start_time && slot.end_time >= end_time {
                slot_to_book = Some(slot.clone());
                slot_index = i;
                break;
            }
        }

        if let Some(slot) = slot_to_book {
            provider_data.available_slots.remove(slot_index as u32);
            provider_data.booked_slots.push_back(slot);
            contract.provider_slots.set(provider, provider_data);
        }
    }

    fn release_provider_slot(contract: &mut SessionManagement, provider: Address, start_time: u64, duration: u32) {
        let mut provider_data = contract.provider_slots.get(&provider).unwrap();
        let end_time = start_time + (duration as u64 * 60);

        // Find and move the slot back to available
        let mut slot_to_release = None;
        let mut slot_index = 0;

        for (i, slot) in provider_data.booked_slots.iter().enumerate() {
            if slot.start_time <= start_time && slot.end_time >= end_time {
                slot_to_release = Some(slot.clone());
                slot_index = i;
                break;
            }
        }

        if let Some(slot) = slot_to_release {
            provider_data.booked_slots.remove(slot_index as u32);
            provider_data.available_slots.push_back(slot);
            contract.provider_slots.set(provider, provider_data);
        }
    }
}
