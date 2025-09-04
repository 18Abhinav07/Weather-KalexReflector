# KALE Weather DAO Oracle System

A autonomous DAO-based weather prediction system for the KALE Weather Gambling Ecosystem. Multiple specialized DAOs analyze live Stellar oracle data and vote on weather outcomes through weighted consensus.

## 🎯 Project Goal

Replace deterministic/random weather outcomes with oracle-driven autonomous predictions that are:
- **Unpredictable**: Eliminates user gaming through live market data
- **Manipulation Resistant**: Multiple competing DAOs prevent single-point control  
- **Community Learnable**: Users develop strategies around DAO performance
- **Blockchain Native**: Fully integrated with Stellar Soroban ecosystem

## 🏗️ Architecture

### Core Components

1. **Oracle Integration Layer** (`src/oracle/`)
   - Integrates with 3 Stellar Reflector networks
   - Handles data validation and caching
   - Provides fallback mechanisms (2/3 operational requirement)

2. **DAO Analysis Engine** (`src/dao/`)
   - 15+ specialized prediction philosophies
   - Configurable weights and accuracy tracking
   - Parallel analysis for 2-minute processing window

3. **Weighted Consensus System** (`src/consensus/`)
   - Vote aggregation with confidence scoring
   - Tie-breaking using block entropy
   - Historical accuracy weighting

4. **Public API** (`src/api/`)
   - REST endpoints for vote calculation/revelation
   - DAO performance metrics
   - System status monitoring

### Data Flow
```
Block N: Oracle Query → DAO Analysis → Vote Submission
Block N+1: Vote Reveal → Weighted Consensus → Weather Outcome
Block N+2: User Actions Begin
```

## 🔮 Oracle Sources

Uses Stellar Reflector network for live market data:

1. **External CEX & DEX** (`CAFJZ...DLN`): BTC, ETH, XLM, SOL, stablecoins
2. **Stellar Pubnet** (`CALI2...LE6M`): KALE, AQUA, EURC, Stellar DEX data  
3. **Foreign Exchange** (`CBKGP...MJZC`): EUR, GBP, CAD, BRL vs USD

## 🤖 DAO Philosophies

### Implemented (3/15+)
- **Crypto Momentum**: BTC/ETH/XLM 5-minute momentum analysis
- **KALE Performance**: KALE/USDC price trend tracking  
- **XLM Dominance**: XLM vs BTC/ETH relative performance

### Configured (12+ additional)
- Mean Reversion, Volatility Clustering, Flight to Safety
- Stellar DEX Health, AQUA Network, Regional Tokens
- Correlation Breakdown, Liquidity Premium, Stablecoin Peg
- Multi-Timeframe, Volume-Price analysis

## 📡 API Endpoints

```bash
# Start voting cycle (called by block monitor)
POST /api/dao/calculate-votes
{
  "cycleId": 1247,
  "blockIndex": 12470,
  "blockEntropy": "abc123..."
}

# Reveal DAO votes for public viewing
GET /api/dao/reveal-votes/1247

# Get DAO performance metrics
GET /api/dao/performance/crypto-momentum

# System status and health
GET /api/dao/status
GET /health
```

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env

# Run in development mode (with auto-reload)
bun run dev

# Or run in production mode
bun run start
```

The server will start at `http://localhost:3000` with:
- Health check: `GET /health`
- System status: `GET /api/dao/status`  
- Vote calculation: `POST /api/dao/calculate-votes`

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## 🔧 Integration

The system is designed to integrate with the existing block monitoring pattern from `ref/block-monitor.ts`. When a new block is discovered, trigger the voting cycle:

```typescript
// In your block monitor
await system.performVotingCycle(
  contractData.index,
  contractData.block?.entropy?.toString('hex') || ''
);
```

## 📊 Example Output

```
🗳️  Starting voting cycle 1247 for block 12470
📡 Oracle data fetched: 3/3 sources, quality: GOOD
🤖 DAO analysis complete: 15 votes collected

DAO Predictions:
┌─────────────────────┬──────────────┬────────────┬──────────────┐
│ DAO Philosophy      │ Prediction   │ Confidence │ Track Record │
├─────────────────────┼──────────────┼────────────┼──────────────┤
│ 🚀 Crypto Momentum  │ GOOD ☀️      │ 85%        │ 67% (134/200)│
│ 📈 XLM Dominance    │ GOOD ☀️      │ 72%        │ 71% (142/200)│
│ 🌊 Mean Reversion   │ BAD 🌧️       │ 91%        │ 63% (126/200)│
└─────────────────────┴──────────────┴────────────┴──────────────┘

✅ Consensus reached: GOOD weather
📊 MODERATE consensus for GOOD weather (score: 0.234, agreement: 73.3%)
⏱️  Processing time: 1,247ms
```

## 📋 Implementation Status

- ✅ **Core Infrastructure**: Complete
- ✅ **Oracle Integration**: All 3 Reflector sources  
- ✅ **Consensus Mechanism**: Weighted voting with tie-breaking
- ✅ **Public API**: REST endpoints with comprehensive responses
- 🔄 **DAO Philosophies**: 3 of 15+ implemented (functional core ready)
- ⏳ **Block Integration**: Ready for existing monitor integration

## 📚 Documentation

- `Docs/Todo/DAOCreation.md` - Complete Phase 2 specification
- `docs/working/dao-oracle-implementation.md` - Implementation progress
- `Docs/reflector/` - Oracle integration guides
- `ref/` - Reference implementations and types

## 🎯 Next Steps

1. **Complete DAO Philosophies**: Implement remaining 12+ algorithms
2. **Block Monitor Integration**: Connect to existing `ref/block-monitor.ts`
3. **Testing & Validation**: End-to-end testing with Stellar testnet
4. **Performance Optimization**: Ensure <2 minute processing window
5. **UI Integration**: Connect to weather gambling interface

The autonomous DAO voting system is now **architecturally complete** and ready for integration with the KALE weather gambling ecosystem! 🌟