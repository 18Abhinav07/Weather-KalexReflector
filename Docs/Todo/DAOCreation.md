# Phase 2: DAO Oracle System - Software Requirements Specification

**Project**: KALE Weather Gambling Ecosystem  
**Phase**: 2 - Autonomous DAO Prediction System  
**Version**: 1.0  
**Date**: September 2025

---

## 1. Executive Summary

### 1.1 Purpose
Replace deterministic/random weather outcomes with autonomous DAO predictions based on live Stellar oracle data. Multiple specialized DAOs analyze identical market feeds, apply distinct philosophies, and vote on weather outcomes through weighted consensus mechanism.

### 1.2 Business Value
- **Unpredictable Weather**: Eliminates user gaming through forecasts or patterns
- **Manipulation Resistance**: Multiple competing prediction entities prevent single-point control
- **Community Learning**: Users develop strategies around DAO accuracy tracking
- **Blockchain Native**: No external dependencies on weather services

### 1.3 Success Criteria
- DAOs produce varied predictions (not unanimous agreement)
- Outcomes feel unpredictable to users analyzing oracle data directly
- DAO reputation system enables user strategy development
- System operates reliably with 2-minute processing windows

---

## 2. System Architecture Overview

### 2.1 Core Components

#### 2.1.1 New Components
- **DAO Registry Contract**: Vote collection, consensus calculation, accuracy tracking
- **Oracle Integration Layer**: Data fetching, validation, caching from 3 sources
- **DAO Analysis Engine**: 15+ philosophy-based prediction algorithms

#### 2.1.2 Modified Components
- **Weather Resolution Contract**: DAO consensus integration
- **Cycle State Manager**: DAO voting phase addition
- **Analytics Dashboard**: DAO performance tracking

#### 2.1.3 Data Flow
```
Block N: Oracle Query → DAO Analysis → Vote Submission
Block N+1: Vote Reveal → Weighted Consensus → Weather Outcome
Block N+2: User Actions Begin (existing flow continues)
```

---

## 3. Technical Requirements

### 3.1 Stellar Soroban Constraints

#### 3.1.1 Contract Size Limitations
- **Maximum Contract Size**: 64KB per WASM module
- **Implication**: DAO analysis logic must be optimized for size
- **Mitigation**: Simple threshold-based algorithms, minimal dependencies

#### 3.1.2 Resource Metering
- **CPU Instructions**: Counted per WASM instruction execution
- **Memory Usage**: 8GB total RAM per validator, shared across all contracts
- **Storage Access**: In-memory live state, archived state on disk
- **Processing Time**: 2-minute window acceptable for DAO voting phase

#### 3.1.3 Development Constraints
- **Language**: Rust only, limited standard library subset
- **Dependencies**: Minimal external crates due to size/resource limits
- **Error Handling**: Simple error types to minimize bytecode size

### 3.2 Oracle Integration Requirements

#### 3.2.1 Data Sources
**Primary Oracle (Crypto Prices)**:
- Contract: `CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN`
- Assets: BTC, ETH, XLM, SOL, USDT, USDC, and 10+ others
- Update Frequency: 5 minutes
- Data Retention: 24 hours

**Secondary Oracle (Stellar DEX)**:
- Contract: `CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M`
- Assets: Stellar-native tokens including AQUA, EURC, various stablecoins
- Includes KALE token price data
- Update Frequency: 5 minutes

**Tertiary Oracle (Forex Rates)**:
- Contract: `CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC`
- Currencies: EUR, GBP, CAD, BRL vs USD
- Update Frequency: 5 minutes

#### 3.2.2 Data Quality Requirements
- **Freshness Validation**: Reject data >10 minutes old
- **Reasonableness Bounds**: Validate price ranges against historical data
- **Cross-Oracle Consistency**: Flag significant discrepancies between sources
- **Fallback Behavior**: System continues with 2/3 oracles operational

### 3.3 DAO Philosophy Specifications

#### 3.3.1 Price Movement Based DAOs

**Crypto Momentum DAO** (Weight: 1.0):
```rust
fn analyze(data: OracleData) -> Prediction {
    let btc_5min = (data.btc_current - data.btc_prev) / data.btc_prev;
    let eth_5min = (data.eth_current - data.eth_prev) / data.eth_prev;
    let xlm_5min = (data.xlm_current - data.xlm_prev) / data.xlm_prev;
    
    let positive_momentum = [btc_5min, eth_5min, xlm_5min]
        .iter().filter(|&&x| x > 0.01).count();
    
    if positive_momentum >= 2 { 
        Prediction::Good 
    } else { 
        Prediction::Bad 
    }
}
```

**Mean Reversion DAO** (Weight: 0.8):
- Logic: Track 1-hour price ranges, predict BAD weather when assets >2 standard deviations from mean
- Data: BTC, ETH, XLM hourly averages vs current prices

**XLM Dominance DAO** (Weight: 1.0):
- Logic: Compare XLM performance vs BTC/ETH, GOOD if XLM outperforming >5%
- Data: XLM/BTC and XLM/ETH relative performance

**KALE Performance DAO** (Weight: 1.0):
- Logic: Track KALE/USDC price trend from Stellar DEX oracle
- Implementation: GOOD if KALE up >2% in 15 minutes, BAD if down >2%

#### 3.3.2 Volatility and Risk Based DAOs

**Volatility Clustering DAO** (Weight: 0.9):
```rust
fn calculate_volatility(prices: &[f64]) -> f64 {
    let returns: Vec<f64> = prices.windows(2)
        .map(|w| (w[1] - w[0]) / w[0])
        .collect();
    
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter()
        .map(|r| (r - mean).powi(2))
        .sum::<f64>() / returns.len() as f64;
    
    variance.sqrt()
}
```

**Flight to Safety DAO** (Weight: 0.7):
- Logic: Measure crypto-stablecoin correlation, BAD if correlation >0.8
- Data: BTC/ETH vs USDT/USDC correlation coefficient

**Cross-Chain Stress DAO** (Weight: 0.6):
- Logic: Monitor bridge token premiums (abUSDC, aeETH, asSOL)
- Implementation: BAD if any bridge token >2% premium/discount from par

#### 3.3.3 Stellar Ecosystem Specific DAOs

**Stellar DEX Health DAO** (Weight: 1.0):
- Logic: Count active Stellar tokens with >$1k daily volume
- Implementation: GOOD if >15 active tokens, BAD if <10

**AQUA Network DAO** (Weight: 0.8):
- Logic: Use AQUA price as ecosystem health proxy
- Implementation: GOOD if AQUA/USDC up >3% in 20 minutes

**Regional Token DAO** (Weight: 0.4):
- Logic: Track emerging market tokens (ARS, PEN, BRL)
- Implementation: BAD if any regional token down >5% (indicates stress)

#### 3.3.4 Market Structure Based DAOs

**Correlation Breakdown DAO** (Weight: 0.9):
- Logic: Measure correlation strength across crypto/forex/Stellar
- Implementation: GOOD if correlations <0.3, BAD if >0.7

**Liquidity Premium DAO** (Weight: 0.7):
- Logic: Compare same assets across crypto vs DEX oracles
- Implementation: BAD if spreads >1% (liquidity fragmentation)

**Stablecoin Peg DAO** (Weight: 0.8):
- Logic: Monitor USDT, USDC, DAI, EURC peg stability
- Implementation: BAD if any major stablecoin >0.5% off peg

#### 3.3.5 Additional DAO Categories

**Multi-Timeframe DAO** (Weight: 0.6), **Volume-Price DAO** (Weight: 0.5), **Forex Stability DAO** (Weight: 0.3), **Overbought/Oversold DAO** (Weight: 0.7), **Sentiment Reversal DAO** (Weight: 0.6), **DeFi Health DAO** (Weight: 0.8), **Layer 1 Competition DAO** (Weight: 0.5), **Institutional Adoption DAO** (Weight: 0.9)

### 3.4 Voting and Consensus Mechanism

#### 3.4.1 Vote Structure
```rust
pub struct DAOVote {
    dao_id: String,
    prediction: WeatherOutcome,  // GOOD = +1, BAD = -1
    confidence: f64,             // 0.1 to 1.0 
    cycle_id: u32,
    timestamp: u64,
}

pub enum WeatherOutcome {
    Good = 1,
    Bad = -1,
}
```

#### 3.4.2 Weighted Consensus Calculation
```rust
fn calculate_consensus(votes: Vec<DAOVote>, weights: HashMap<String, f64>) -> f64 {
    let weighted_sum: f64 = votes.iter()
        .map(|vote| {
            let weight = weights.get(&vote.dao_id).unwrap_or(&0.5);
            vote.prediction as i8 as f64 * vote.confidence * weight
        })
        .sum();
    
    let total_weight: f64 = votes.iter()
        .map(|vote| {
            let weight = weights.get(&vote.dao_id).unwrap_or(&0.5);
            vote.confidence * weight
        })
        .sum();
    
    weighted_sum / total_weight
}
```

#### 3.4.3 Tie Breaking
- If consensus score between -0.05 and +0.05, use hash(block_entropy + cycle_id) % 2
- Probability: <5% of cycles based on DAO diversity

#### 3.4.4 Final Weather Integration
```rust
final_weather = dao_consensus * 0.5 + real_weather * 0.3 + community_bets * 0.2
```

---

## 4. Data Requirements

### 4.1 Storage Requirements

#### 4.1.1 New Database Tables
```sql
-- DAO Registry
CREATE TABLE daos (
    dao_id VARCHAR(50) PRIMARY KEY,
    dao_name VARCHAR(100),
    philosophy_type VARCHAR(50),
    voting_weight DECIMAL(3,2),
    total_predictions INTEGER DEFAULT 0,
    correct_predictions INTEGER DEFAULT 0,
    accuracy_percentage DECIMAL(5,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DAO Votes per Cycle
CREATE TABLE dao_votes (
    vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dao_id VARCHAR(50) REFERENCES daos(dao_id),
    cycle_id INTEGER,
    predicted_weather VARCHAR(10),
    confidence_level DECIMAL(3,2),
    vote_timestamp TIMESTAMP,
    was_correct BOOLEAN,
    UNIQUE(dao_id, cycle_id)
);

-- Oracle Data Cache
CREATE TABLE oracle_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id INTEGER,
    oracle_source VARCHAR(100),
    asset_data JSONB,
    collected_at TIMESTAMP,
    is_valid BOOLEAN DEFAULT TRUE
);
```

#### 4.1.2 Modified Tables
```sql
-- Add DAO consensus to existing cycles table
ALTER TABLE cycles ADD COLUMN dao_consensus_score DECIMAL(5,4);
ALTER TABLE cycles ADD COLUMN dao_votes_count INTEGER DEFAULT 0;
ALTER TABLE cycles ADD COLUMN oracle_data_quality VARCHAR(20) DEFAULT 'GOOD';
```

### 4.2 Smart Contract Storage

#### 4.2.1 DAO Registry Contract Storage
- DAO configurations (15 entries × ~200 bytes = 3KB)
- Current cycle votes (15 votes × ~100 bytes = 1.5KB per cycle)
- Historical accuracy (15 DAOs × 1000 cycles × 1 byte = 15KB)
- Total: ~20KB persistent storage

#### 4.2.2 Oracle Cache Contract Storage
- Latest oracle data (3 sources × ~2KB each = 6KB)
- 5-cycle historical data for trend analysis (6KB × 5 = 30KB)
- Total: ~36KB, auto-archived after 24 hours

---

## 5. Interface Requirements

### 5.1 User Interface Components

#### 5.1.1 DAO Voting Display
```
Current Cycle: #1247
DAO Predictions (Block 12470 → 12471):

┌─────────────────────┬──────────────┬────────────┬──────────────┐
│ DAO Philosophy      │ Prediction   │ Confidence │ Track Record │
├─────────────────────┼──────────────┼────────────┼──────────────┤
│ 🚀 Crypto Momentum  │ GOOD ☀️      │ 85%        │ 67% (134/200)│
│ 📈 XLM Dominance    │ GOOD ☀️      │ 72%        │ 71% (142/200)│
│ 🌊 Mean Reversion   │ BAD 🌧️       │ 91%        │ 63% (126/200)│
│ ⚡ Volatility       │ BAD 🌧️       │ 78%        │ 69% (138/200)│
│ 🏦 DeFi Health      │ GOOD ☀️      │ 65%        │ 58% (116/200)│
└─────────────────────┴──────────────┴────────────┴──────────────┘

Weighted Consensus: +0.23 → GOOD WEATHER ☀️
Community Influence: +0.15 (65% betting GOOD)
```

#### 5.1.2 Historical DAO Performance
```
DAO Performance Analysis (Last 50 Cycles):

Crypto Momentum: ████████████████░░░░ 67% │ Best: Bull runs
XLM Dominance:   ███████████████████░░ 71% │ Best: Stellar news
Mean Reversion:  ██████████████░░░░░░ 63% │ Best: Corrections  
Volatility:      ████████████████████░ 69% │ Best: Stable periods

Top Performers This Month:
1. 🎯 Technical Analysis - 78% (19/25)
2. 📊 Correlation Breakdown - 76% (18/25) 
3. 🌊 Mean Reversion - 74% (17/25)
```

### 5.2 API Requirements

#### 5.2.1 DAO Data Endpoints
```
GET /api/v1/cycles/{cycleId}/dao-votes
- Returns all DAO predictions for specific cycle
- Include confidence scores and timestamps

GET /api/v1/daos/{daoId}/performance
- Historical accuracy metrics
- Performance by market condition
- Prediction confidence trends

GET /api/v1/oracle-data/current
- Latest oracle snapshots from all 3 sources
- Data quality indicators
- Time since last update
```

---

## 6. Performance Requirements

### 6.1 Processing Time Constraints

#### 6.1.1 DAO Analysis Phase (Block N)
- **Oracle Data Collection**: <30 seconds
- **All 15 DAO Analysis**: <60 seconds  
- **Vote Submission**: <20 seconds
- **Total Block N Duration**: <2 minutes ✓

#### 6.1.2 Consensus Calculation (Block N+1)
- **Vote Aggregation**: <10 seconds
- **Weighted Consensus**: <5 seconds
- **Weather Score Integration**: <5 seconds
- **Total Block N+1 Duration**: <20 seconds

### 6.2 Resource Utilization

#### 6.2.1 Smart Contract Optimization
- **Contract Size Target**: <45KB (70% of 64KB limit)
- **Memory Usage**: <100MB peak during processing
- **CPU Instructions**: <500M instructions per cycle
- **Storage Reads/Writes**: <1000 entries per cycle

#### 6.2.2 Oracle Query Optimization
- **Single Shared Query**: 3 oracle calls per cycle (not 45)
- **Data Caching**: Store processed data for DAO sharing
- **Retry Logic**: Max 2 retries per oracle, 10-second timeout

---

## 7. Risk Management

### 7.1 Technical Risks

#### 7.1.1 Oracle Dependency Failure
**Risk**: Oracle becomes unavailable during critical voting phase
**Mitigation**: 
- Require 2/3 oracles operational to proceed
- Cache last-known-good data for emergency fallback
- Circuit breaker to pause system if all oracles fail

#### 7.1.2 DAO Prediction Convergence
**Risk**: All DAOs start predicting identically (no variety)
**Mitigation**:
- Monitor prediction diversity each cycle
- Alert if >80% DAOs agree for >5 consecutive cycles
- Manual philosophy adjustment capability

#### 7.1.3 Smart Contract Size Overflow
**Risk**: Adding 15 DAOs exceeds 64KB Soroban limit
**Mitigation**:
- Implement simple threshold-based logic only
- Use compact data structures
- Split into multiple contracts if necessary

### 7.2 Economic Risks

#### 7.2.1 DAO Gaming
**Risk**: Users reverse-engineer DAO logic to predict outcomes
**Mitigation**:
- Use oracle data directly in prediction logic (no advance knowledge)
- Complex weighting makes gaming difficult
- Monitor for suspicious betting patterns

#### 7.2.2 Oracle Manipulation
**Risk**: Large actors influence oracle feeds indirectly
**Mitigation**:
- Use multiple independent oracle sources
- Implement outlier detection and flagging
- Log all oracle data for audit trails

---

## 8. Implementation Timeline

### 8.1 Phase 2A: Core Infrastructure (3 weeks)

#### Week 1: Smart Contract Foundation
- [ ] DAO Registry Contract development
- [ ] Basic vote submission and retrieval
- [ ] Oracle integration layer (single oracle)
- [ ] Simple consensus mechanism

#### Week 2: DAO Logic Implementation  
- [ ] Core 6 DAO philosophies (Momentum, Mean Reversion, Volatility, XLM Dominance, KALE Performance, Correlation)
- [ ] Oracle data parsing and validation
- [ ] Vote confidence scoring
- [ ] Historical accuracy tracking

#### Week 3: Integration & Testing
- [ ] Weather Resolution Contract integration
- [ ] Cycle State Manager updates
- [ ] Unit testing all DAO logic
- [ ] Testnet deployment and validation

### 8.2 Phase 2B: Full DAO Ecosystem (2 weeks)

#### Week 4: Remaining DAOs
- [ ] Additional 9 DAO philosophies
- [ ] All 3 oracle sources integration
- [ ] Cross-oracle validation
- [ ] Performance optimization

#### Week 5: UI and Monitoring
- [ ] DAO voting display interface
- [ ] Historical performance dashboards  
- [ ] API endpoints for DAO data
- [ ] Monitoring and alerting systems

### 8.3 Phase 2C: Production Readiness (2 weeks)

#### Week 6: Testing & Optimization
- [ ] Comprehensive integration testing
- [ ] Load testing with all 15 DAOs
- [ ] Security audit of smart contracts
- [ ] Performance profiling and optimization

#### Week 7: Deployment & Documentation
- [ ] Mainnet deployment preparation
- [ ] User documentation and guides
- [ ] API documentation
- [ ] Emergency procedures documentation

---

## 9. Acceptance Criteria

### 9.1 Functional Requirements
- ✅ All 15 DAOs successfully analyze oracle data and submit votes within 2 minutes
- ✅ Weighted consensus mechanism produces final weather scores
- ✅ DAO accuracy tracking persists across cycles and updates correctly
- ✅ System handles oracle failures gracefully (2/3 operational requirement)
- ✅ UI displays all DAO predictions with confidence and historical accuracy
- ✅ Integration with existing weather calculation formula works correctly

### 9.2 Performance Requirements  
- ✅ Complete DAO voting phase within 2-minute block window
- ✅ Consensus calculation completes within 20 seconds
- ✅ Oracle data collection <30 seconds for all 3 sources
- ✅ Smart contract size remains under 64KB limit
- ✅ System processes 15 DAO analyses without performance degradation

### 9.3 Quality Requirements
- ✅ DAO predictions show variety (not >80% agreement for >5 cycles)
- ✅ Oracle data quality validation catches stale/invalid data
- ✅ Historical accuracy calculations remain consistent across restarts
- ✅ All DAO vote submission and consensus calculation is deterministic
- ✅ System maintains audit trail of all DAO votes and oracle data

---

## 10. Success Metrics

### 10.1 Technical Metrics
- **Oracle Reliability**: >99% successful data collection
- **DAO Processing Time**: <2 minutes average per cycle
- **Consensus Calculation**: <20 seconds average
- **Smart Contract Gas Usage**: <defined Soroban limits
- **System Uptime**: >99.5% availability

### 10.2 Business Metrics
- **Prediction Variety**: <80% DAO agreement threshold
- **User Engagement**: Users utilize DAO performance data for decisions
- **Weather Unpredictability**: Users cannot reliably predict outcomes
- **DAO Learning**: Users develop preferences based on DAO track records

### 10.3 Quality Metrics
- **Oracle Data Quality**: >95% valid data rate
- **DAO Accuracy Distribution**: No single DAO >85% accuracy (prevents dominance)
- **Consensus Stability**: Final weather scores remain consistent on identical inputs
- **Audit Trail Completeness**: 100% of votes and oracle data logged

---

**Document Status**: Ready for Implementation  
**Next Phase**: Phase 3 - Weather Integration (Real weather data + community influence)  
**Estimated Completion**: 7 weeks from Phase 2 start