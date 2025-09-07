-- KALE Weather Farming System - Phase 1 Database Schema
-- Per SRS Section 7.1 Requirements

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table: Core user registration and authentication
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    main_wallet_address VARCHAR(56) NOT NULL UNIQUE, -- Stellar address format
    custodial_wallet_address VARCHAR(56) NOT NULL UNIQUE, -- Generated custodial wallet
    current_state VARCHAR(20) DEFAULT 'active' CHECK (current_state IN ('active', 'suspended', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT users_main_wallet_check CHECK (main_wallet_address ~ '^G[A-Z0-9]{55}$'),
    CONSTRAINT users_custodial_wallet_check CHECK (custodial_wallet_address ~ '^G[A-Z0-9]{55}$')
);

-- Custodial Wallets Table: Secure wallet management per SRS REQ-001
CREATE TABLE custodial_wallets (
    wallet_address VARCHAR(56) PRIMARY KEY, -- Stellar public key
    encrypted_private_key TEXT NOT NULL, -- AES-256 encrypted private key
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    current_balance BIGINT DEFAULT 0, -- KALE balance in stroops (7 decimals)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    
    -- Security and performance indexes
    CONSTRAINT custodial_wallets_address_check CHECK (wallet_address ~ '^G[A-Z0-9]{55}$'),
    CONSTRAINT custodial_wallets_balance_check CHECK (current_balance >= 0)
);

-- Weather Cycles Table: 10-block weather gaming periods per SRS
CREATE TABLE weather_cycles (
    cycle_id BIGINT PRIMARY KEY, -- Block-based cycle identifier
    start_block BIGINT NOT NULL,
    end_block BIGINT NOT NULL,
    current_state VARCHAR(20) DEFAULT 'active' CHECK (current_state IN ('active', 'completed', 'settled')),
    weather_outcome VARCHAR(10) CHECK (weather_outcome IN ('GOOD', 'BAD')), -- Binary outcome per SRS
    weather_confidence DECIMAL(5,4), -- DAO confidence score (0.0000-1.0000)
    
    -- Real-world location data (revealed at block 6)
    revealed_location_id VARCHAR(50), -- Location identifier (e.g., 'tokyo-jp')
    revealed_location_name VARCHAR(100), -- Human-readable name (e.g., 'Tokyo, Japan')  
    revealed_location_coords JSONB, -- Coordinates as JSON: {"lat": 35.6762, "lon": 139.6503}
    location_selection_hash VARCHAR(64), -- SHA-256 hash of selection process
    location_revealed_at TIMESTAMP WITH TIME ZONE, -- When location was revealed (block 6)
    
    -- Real-time weather data (fetched after location reveal)
    current_weather_data JSONB, -- Full weather data as JSON
    weather_score DECIMAL(5,2), -- Kale farming suitability score (0.00-100.00)
    weather_source VARCHAR(50), -- API source (e.g., 'OpenWeatherMap')
    weather_fetched_at TIMESTAMP WITH TIME ZONE, -- When weather was fetched
    weather_fetch_error TEXT, -- Error message if weather fetch failed
    
    total_participants INTEGER DEFAULT 0,
    total_stake_amount BIGINT DEFAULT 0, -- Total KALE staked in cycle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Validation constraints
    CONSTRAINT weather_cycles_block_range CHECK (end_block > start_block),
    CONSTRAINT weather_cycles_block_span CHECK (end_block - start_block = 9) -- 10 blocks exactly
);

-- Farm Positions Table: Individual user farming positions per SRS
CREATE TABLE farm_positions (
    position_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    cycle_id BIGINT NOT NULL REFERENCES weather_cycles(cycle_id) ON DELETE CASCADE,
    stake_amount BIGINT NOT NULL CHECK (stake_amount > 0), -- KALE staked in stroops
    plant_block BIGINT NOT NULL, -- Specific block where planted
    plant_transaction_hash VARCHAR(64), -- Stellar transaction hash
    work_transaction_hash VARCHAR(64), -- Work completion transaction
    harvest_transaction_hash VARCHAR(64), -- Final harvest transaction
    base_reward BIGINT DEFAULT 0, -- Reward before weather modifier
    weather_modifier DECIMAL(5,4) DEFAULT 1.0000, -- Weather multiplier applied
    final_reward BIGINT DEFAULT 0, -- Final reward after weather application
    status VARCHAR(20) DEFAULT 'planted' CHECK (status IN ('planted', 'worked', 'harvested', 'settled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE,
    
    -- Business logic constraints
    CONSTRAINT farm_positions_block_in_cycle CHECK (plant_block >= (SELECT start_block FROM weather_cycles WHERE cycle_id = farm_positions.cycle_id) AND plant_block <= (SELECT end_block FROM weather_cycles WHERE cycle_id = farm_positions.cycle_id)),
    CONSTRAINT farm_positions_reward_check CHECK (final_reward >= 0)
);

-- Plant Requests Table: User farming requests per SRS REQ-003
CREATE TABLE plant_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    cycle_id BIGINT NOT NULL REFERENCES weather_cycles(cycle_id) ON DELETE CASCADE,
    stake_amount BIGINT NOT NULL CHECK (stake_amount > 0),
    target_block BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'executing', 'completed', 'failed')),
    error_message TEXT, -- For failed request tracking
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure users can only have one request per block per cycle
    CONSTRAINT plant_requests_unique_user_block UNIQUE (user_id, cycle_id, target_block)
);

-- Transaction Log Table: Complete audit trail per SRS security requirements
CREATE TABLE transaction_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'plant', 'work', 'harvest', 'settlement')),
    amount BIGINT NOT NULL, -- Can be negative for withdrawals/losses
    wallet_address VARCHAR(56) NOT NULL,
    stellar_transaction_hash VARCHAR(64), -- Reference to Stellar network transaction
    related_position_id UUID REFERENCES farm_positions(position_id) ON DELETE SET NULL,
    related_cycle_id BIGINT REFERENCES weather_cycles(cycle_id) ON DELETE SET NULL,
    metadata JSONB, -- Additional transaction context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit trail requirements
    CONSTRAINT transaction_log_wallet_check CHECK (wallet_address ~ '^G[A-Z0-9]{55}$')
);

-- Balance Snapshots Table: Point-in-time balance tracking for reconciliation
CREATE TABLE balance_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    wallet_address VARCHAR(56) NOT NULL,
    balance_amount BIGINT NOT NULL CHECK (balance_amount >= 0),
    snapshot_reason VARCHAR(50) NOT NULL, -- 'daily', 'cycle_end', 'settlement', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_users_main_wallet ON users(main_wallet_address);
CREATE INDEX idx_users_custodial_wallet ON users(custodial_wallet_address);
CREATE INDEX idx_custodial_wallets_user_id ON custodial_wallets(user_id);
CREATE INDEX idx_weather_cycles_state ON weather_cycles(current_state);
CREATE INDEX idx_weather_cycles_blocks ON weather_cycles(start_block, end_block);
CREATE INDEX idx_farm_positions_user_cycle ON farm_positions(user_id, cycle_id);
CREATE INDEX idx_farm_positions_status ON farm_positions(status);
CREATE INDEX idx_plant_requests_status ON plant_requests(status);
CREATE INDEX idx_plant_requests_target_block ON plant_requests(target_block);
CREATE INDEX idx_transaction_log_user_type ON transaction_log(user_id, transaction_type);
CREATE INDEX idx_transaction_log_created ON transaction_log(created_at);
CREATE INDEX idx_balance_snapshots_user_created ON balance_snapshots(user_id, created_at);

-- Views for common queries

-- Active user positions summary
CREATE VIEW user_active_positions AS
SELECT 
    u.user_id,
    u.main_wallet_address,
    COUNT(fp.position_id) as active_positions,
    COALESCE(SUM(fp.stake_amount), 0) as total_staked,
    COALESCE(SUM(fp.final_reward), 0) as total_rewards
FROM users u
LEFT JOIN farm_positions fp ON u.user_id = fp.user_id AND fp.status != 'settled'
GROUP BY u.user_id, u.main_wallet_address;

-- Cycle participation summary  
CREATE VIEW cycle_participation AS
SELECT 
    wc.cycle_id,
    wc.start_block,
    wc.end_block,
    wc.weather_outcome,
    COUNT(fp.position_id) as participant_count,
    COALESCE(SUM(fp.stake_amount), 0) as total_cycle_stake,
    COALESCE(SUM(fp.final_reward), 0) as total_cycle_rewards
FROM weather_cycles wc
LEFT JOIN farm_positions fp ON wc.cycle_id = fp.cycle_id
GROUP BY wc.cycle_id, wc.start_block, wc.end_block, wc.weather_outcome;

-- User balance reconciliation view
CREATE VIEW user_balance_reconciliation AS
SELECT 
    u.user_id,
    u.main_wallet_address,
    cw.current_balance as custodial_balance,
    COALESCE(SUM(CASE WHEN tl.transaction_type IN ('deposit', 'harvest') THEN tl.amount ELSE 0 END), 0) as total_credits,
    COALESCE(SUM(CASE WHEN tl.transaction_type IN ('withdrawal', 'plant') THEN ABS(tl.amount) ELSE 0 END), 0) as total_debits,
    COALESCE(SUM(CASE WHEN fp.status = 'settled' THEN fp.stake_amount ELSE 0 END), 0) as settled_stakes
FROM users u
JOIN custodial_wallets cw ON u.user_id = cw.user_id
LEFT JOIN transaction_log tl ON u.user_id = tl.user_id
LEFT JOIN farm_positions fp ON u.user_id = fp.user_id
GROUP BY u.user_id, u.main_wallet_address, cw.current_balance;

-- Triggers for data integrity

-- Update last_active on user operations
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = NOW() WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_last_active_requests 
    AFTER INSERT ON plant_requests 
    FOR EACH ROW EXECUTE FUNCTION update_user_last_active();

CREATE TRIGGER trigger_update_user_last_active_positions 
    AFTER INSERT OR UPDATE ON farm_positions 
    FOR EACH ROW EXECUTE FUNCTION update_user_last_active();

-- Update balance snapshots on significant balance changes
CREATE OR REPLACE FUNCTION create_balance_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    IF ABS(NEW.current_balance - COALESCE(OLD.current_balance, 0)) > 1000000 THEN -- > 0.1 KALE
        INSERT INTO balance_snapshots (user_id, wallet_address, balance_amount, snapshot_reason)
        VALUES (NEW.user_id, NEW.wallet_address, NEW.current_balance, 'significant_change');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_balance_snapshot 
    AFTER UPDATE OF current_balance ON custodial_wallets 
    FOR EACH ROW EXECUTE FUNCTION create_balance_snapshot();

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user registration and custodial wallet mapping per SRS REQ-001';
COMMENT ON TABLE custodial_wallets IS 'Individual encrypted wallet management per SRS security requirements';
COMMENT ON TABLE weather_cycles IS '10-block weather gaming periods with binary GOOD/BAD outcomes';
COMMENT ON TABLE farm_positions IS 'Individual user farming positions with weather modifier application';
COMMENT ON TABLE plant_requests IS 'User plant request queue and execution tracking per SRS REQ-003';
COMMENT ON TABLE transaction_log IS 'Complete audit trail for all balance and farming operations';
COMMENT ON TABLE balance_snapshots IS 'Point-in-time balance tracking for reconciliation and dispute resolution';

-- Balance Summary View for comprehensive user balance tracking
CREATE VIEW user_balance_summary AS
SELECT 
    u.user_id,
    u.username,
    COALESCE(cw.current_balance, 0) as current_balance,
    COALESCE(staked.total_staked, 0) as total_staked,
    COALESCE(cw.current_balance, 0) + COALESCE(staked.total_staked, 0) as total_balance,
    COALESCE(pending.pending_deposits, 0) as pending_deposits,
    COALESCE(positions.active_positions, 0) as active_positions
FROM users u
LEFT JOIN custodial_wallets cw ON u.user_id = cw.user_id AND cw.is_active = true
LEFT JOIN (
    SELECT fp.user_id, SUM(fp.stake_amount) as total_staked
    FROM farm_positions fp
    WHERE fp.status IN ('planted', 'worked', 'harvested')
    GROUP BY fp.user_id
) staked ON u.user_id = staked.user_id
LEFT JOIN (
    SELECT tl.user_id, SUM(tl.amount) as pending_deposits
    FROM transaction_log tl
    WHERE tl.transaction_type = 'deposit' 
    AND tl.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY tl.user_id
) pending ON u.user_id = pending.user_id
LEFT JOIN (
    SELECT fp.user_id, COUNT(*) as active_positions
    FROM farm_positions fp
    WHERE fp.status IN ('planted', 'worked', 'harvested')
    GROUP BY fp.user_id
) positions ON u.user_id = positions.user_id;

COMMENT ON VIEW user_balance_summary IS 'Comprehensive user balance view including custodial, staked, and pending amounts';

-- Cycle Actions Table for real-time demo interactions
CREATE TABLE cycle_actions (
    action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    cycle_id BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('agriculture', 'wager', 'stay')),
    action_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, cycle_id, block_number)
);

CREATE INDEX idx_cycle_actions_cycle_block ON cycle_actions(cycle_id, block_number);
CREATE INDEX idx_cycle_actions_user_cycle ON cycle_actions(user_id, cycle_id);

COMMENT ON TABLE cycle_actions IS 'Real-time user actions during weather farming cycles for demo';

-- Grant permissions (adjust as needed for your deployment)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kale_weather_app;
-- GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO kale_weather_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kale_weather_app;