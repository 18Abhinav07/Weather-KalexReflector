# Quick Setup Guide

## Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Node.js 18+ (for compatibility)

## Installation

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Setup environment:**
   ```bash
   cp .env.example .env
   ```

3. **Configure your environment variables in `.env`:**
   ```bash
   # Edit .env file with your settings
   STELLAR_NETWORK=testnet
   STELLAR_RPC_URL=https://soroban-testnet.stellar.org
   PORT=3000
   ```

## Running the System

### Development Mode (with auto-reload)
```bash
bun run dev
```

### Production Mode
```bash
bun run start
```

### Build for Distribution
```bash
bun run build
```

## Testing the API

Once running, the system will be available at `http://localhost:3000`

### Health Check
```bash
curl http://localhost:3000/health
```

### System Status
```bash
curl http://localhost:3000/api/dao/status
```

### Trigger Voting Cycle
```bash
curl -X POST http://localhost:3000/api/dao/calculate-votes \
  -H "Content-Type: application/json" \
  -d '{
    "cycleId": 1001,
    "blockIndex": 12345,
    "blockEntropy": "abc123def456"
  }'
```

### View Vote Results
```bash
curl http://localhost:3000/api/dao/reveal-votes/1001
```

## Development Features

- **Hot Reload**: Files automatically reload in dev mode
- **Test Cycles**: Runs mock voting cycles every 5 minutes in development
- **Comprehensive Logging**: Detailed console output for debugging
- **Health Monitoring**: Built-in system health checks

## Integration with Block Monitor

To integrate with your existing block monitoring system from `ref/block-monitor.ts`, add this to your block discovery handler:

```typescript
import { createDAOOracleSystem } from './src/dao-oracle-system';

const daoSystem = createDAOOracleSystem({
  rpcUrl: Config.STELLAR.RPC_URL,
  stellarNetwork: 'testnet'
});

// In your block discovery handler
const result = await daoSystem.performVotingCycle(
  contractData.index,
  contractData.block?.entropy?.toString('hex') || ''
);

console.log(`Weather outcome: ${result.finalWeather === 1 ? 'GOOD' : 'BAD'}`);
```

## Project Structure

```
src/
├── oracle/           # Oracle data fetching from Stellar Reflector
├── dao/             # DAO registry and philosophy implementations  
├── consensus/       # Weighted voting and consensus calculation
├── api/            # REST API endpoints
├── types/          # TypeScript type definitions
└── dao-oracle-system.ts  # Main system orchestrator

server.ts           # Server entry point
package.json       # Dependencies and scripts
tsconfig.json      # TypeScript configuration
.env.example       # Environment variables template
```

The system is now ready to run with Bun! 🎉