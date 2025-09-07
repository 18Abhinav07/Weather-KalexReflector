-- KALE Weather Farming System - Test Database Schema
-- Simplified for testing components

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Weather Cycles Table
CREATE TABLE weather_cycles (
    cycle_id BIGINT PRIMARY KEY,
    current_state VARCHAR(20) DEFAULT 'planting' CHECK (current_state IN ('planting', 'working', 'revealing', 'settling', 'completed')),
    start_block VARCHAR(20) NOT NULL,
    current_block VARCHAR(20) NOT NULL,
    weather_outcome VARCHAR(10) CHECK (weather_outcome IN ('GOOD', 'BAD')),
    weather_confidence DECIMAL(5,4),
    final_weather_score DECIMAL(5,2),
    
    -- Location data
    revealed_location_id VARCHAR(50),
    revealed_location_name VARCHAR(100),
    revealed_location_coordinates JSONB,
    revealed_location_climate VARCHAR(20),
    location_selection_hash VARCHAR(64),
    location_revealed_at TIMESTAMP WITH TIME ZONE,
    
    -- Weather resolution data
    dao_consensus_data JSONB,
    current_weather_data JSONB,
    weather_resolved_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weather Wagers Table
CREATE TABLE weather_wagers (
    wager_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100) NOT NULL,
    cycle_id BIGINT NOT NULL REFERENCES weather_cycles(cycle_id),
    wager_type VARCHAR(10) NOT NULL CHECK (wager_type IN ('good', 'bad')),
    amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000),
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Payout tracking
    payout_amount INTEGER DEFAULT 0,
    is_winner BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(user_id, cycle_id) -- One wager per user per cycle
);

-- Indexes for performance
CREATE INDEX idx_weather_cycles_state ON weather_cycles(current_state);
CREATE INDEX idx_weather_cycles_cycle_id ON weather_cycles(cycle_id);
CREATE INDEX idx_weather_wagers_cycle_id ON weather_wagers(cycle_id);
CREATE INDEX idx_weather_wagers_user_id ON weather_wagers(user_id);
CREATE INDEX idx_weather_wagers_type ON weather_wagers(wager_type);