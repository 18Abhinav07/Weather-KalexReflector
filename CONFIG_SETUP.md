# KALE Weather Farming System - Configuration Setup Guide

## Overview

The KALE Weather Farming System uses a centralized configuration system that automatically loads environment variables from `.env` files and validates all required settings before startup.

## Quick Start

1. **Copy the example configuration:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file with your actual values:**
   ```bash
   nano .env
   ```

3. **Start the server:**
   ```bash
   bun run dev
   ```

## Environment File Priority

The system automatically searches for environment files in this order:

1. `.env.mainnet` (for production mainnet)
2. `.env.testnet` (for testnet development)
3. `.env.local` (for local development)
4. `.env` (default fallback)

## Required Configuration

### 🔴 Critical (Server won't start without these):

```bash
# Database (PostgreSQL required)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=kale_weather_farming
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password

# Stellar Network
STELLAR_NETWORK=testnet  # or mainnet
STELLAR_CONTRACT_ID=C... # Your KALE contract ID
KALE_TOKEN_ADDRESS=G... # Your KALE token address

# Weather APIs (all 3 required)
OPENWEATHER_API_KEY=your_key
WEATHERAPI_KEY=your_key
VISUAL_CROSSING_API_KEY=your_key
```

### 🟡 Important (Has defaults but should be customized):

```bash
# Server
PORT=3000
JWT_SECRET=your-secure-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# Security
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

## Getting API Keys

### Weather APIs (Free Tiers Available)

1. **OpenWeatherMap**: https://openweathermap.org/api
   - Sign up → API Keys → Copy "Current Weather Data" key
   
2. **WeatherAPI.com**: https://www.weatherapi.com/
   - Sign up → API → Copy API key
   
3. **Visual Crossing**: https://www.visualcrossing.com/weather-api
   - Sign up → Account → Copy API key

### Stellar Network

1. **Testnet** (for development):
   ```bash
   STELLAR_NETWORK=testnet
   STELLAR_RPC_URL=https://horizon-testnet.stellar.org
   ```

2. **Mainnet** (for production):
   ```bash
   STELLAR_NETWORK=mainnet
   STELLAR_RPC_URL=https://horizon.stellar.org
   ```

## Configuration Sections

### Server Settings
- `PORT`: HTTP server port (default: 3000)
- `HOST`: Server bind address (default: 0.0.0.0)
- `CORS_ORIGIN`: Allowed CORS origins
- `JWT_SECRET`: Secret for JWT token signing

### Database
- `POSTGRES_*`: PostgreSQL connection parameters
- `DATABASE_POOL_SIZE`: Connection pool size (default: 20)
- `DATABASE_TIMEOUT_MS`: Query timeout (default: 30000)

### Stellar Integration
- `STELLAR_NETWORK`: Network type (testnet/mainnet)
- `STELLAR_RPC_URL`: Horizon server URL
- `STELLAR_CONTRACT_ID`: KALE farming contract address
- `KALE_TOKEN_ADDRESS`: KALE token issuer address

### Weather APIs
- Weather provider API keys and settings
- `DEFAULT_LOCATION`: Fallback location for weather data
- `WEATHER_CACHE_TTL_MS`: Cache duration for weather data

### Farming System
- `FARMING_AUTOMATION_INTERVAL_MS`: Automation check frequency
- `FARMING_WORK_DELAY_BLOCKS`: Blocks before work phase
- `FARMING_HARVEST_DELAY_BLOCKS`: Blocks before harvest
- `FARMING_MIN_STAKE_AMOUNT`: Minimum KALE stake (in stroops)
- `FARMING_MAX_STAKE_AMOUNT`: Maximum KALE stake (in stroops)

### Cycle Configuration
- `CYCLE_LENGTH_BLOCKS`: Total blocks per cycle
- `CYCLE_START_BLOCK`: Genesis block for cycle calculations
- Phase block allocations (planting, working, revealing, settling)

## Development vs Production

### Development Configuration
```bash
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_DEBUG_ENDPOINTS=true
DETAILED_LOGGING=true
STELLAR_NETWORK=testnet
```

### Production Configuration
```bash
NODE_ENV=production
LOG_LEVEL=info
ENABLE_DEBUG_ENDPOINTS=false
DETAILED_LOGGING=false
STELLAR_NETWORK=mainnet
# Strong JWT and encryption keys required
JWT_SECRET=your-production-jwt-secret
ENCRYPTION_KEY=your-production-encryption-key
```

## Validation & Error Handling

The system validates:
- ✅ **Format validation**: URLs, addresses, numeric values
- ✅ **Required variables**: Won't start without critical config
- ✅ **Range validation**: Ports, timeouts, limits
- ✅ **Network consistency**: Stellar network settings
- ✅ **API key validation**: Minimum length checks

### Common Errors

1. **"Required environment variable X is not set"**
   - Add the missing variable to your `.env` file

2. **"STELLAR_CONTRACT_ID must be a valid contract address starting with C"**
   - Check your contract ID format

3. **"API key appears too short"**
   - Verify your weather API keys are complete

4. **"PORT must be between 1024 and 65535"**
   - Use a valid port number

## Security Best Practices

1. **Never commit `.env` files** (already in `.gitignore`)
2. **Use strong secrets in production**
3. **Rotate API keys regularly**
4. **Use environment-specific configs** (`.env.mainnet`, `.env.testnet`)
5. **Enable SSL for production databases**

## Troubleshooting

### Server Won't Start
1. Check that all required variables are set
2. Verify API key formats and validity
3. Ensure database is accessible
4. Check port availability

### Configuration Not Loading
1. Verify `.env` file exists in project root
2. Check file permissions
3. Ensure no syntax errors in `.env` file
4. Review startup logs for file path detection

### Database Connection Issues
1. Verify PostgreSQL is running
2. Check database exists and user has access
3. Test connection parameters
4. Review firewall/network settings

## Environment Examples

### Minimal Development Setup
```bash
# Copy and modify for local development
cp .env.local.example .env.local

# Edit with your local database and API keys
nano .env.local
```

### Production Deployment
```bash
# Use environment-specific config
cp .env.example .env.mainnet

# Configure for mainnet with production values
nano .env.mainnet
```

The configuration system will automatically detect and load the appropriate environment file based on your deployment context.