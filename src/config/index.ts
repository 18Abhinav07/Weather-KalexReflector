// Centralized Configuration System for KALE Weather Farming System
// Based on reference implementation patterns

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

config();

// Load environment variables from appropriate .env file
// Try multiple paths to find the correct .env file
const envPaths = [
  join(process.cwd(), '.env.mainnet'),
  join(process.cwd(), '.env.testnet'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  // Also try relative to this config file's location
  join(__dirname, '..', '..', '.env.mainnet'),
  join(__dirname, '..', '..', '.env.testnet'),
  join(__dirname, '..', '..', '.env.local'),
  join(__dirname, '..', '..', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    console.log(`[Config] Loading environment from: ${envPath}`);
    config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('[Config] No .env file found, using system environment variables');
}

interface KaleWeatherFarmingConfig {
  // Core application settings
  NODE_ENV: string;
  LOG_LEVEL: string;
  
  // Server settings  
  SERVER: {
    HOST: string;
    PORT: number;
    CORS_ORIGIN: string[];
    JWT_SECRET: string;
    JWT_EXPIRES_IN: number;
    ALLOWED_ORIGINS: string[];
  };
  
  // Database configuration
  DATABASE: {
    HOST: string;
    PORT: number;
    NAME: string;
    USER: string;
    PASSWORD: string;
    SSL: boolean;
    POOL_SIZE: number;
    TIMEOUT_MS: number;
  };
  
  // Stellar network configuration
  STELLAR: {
    NETWORK: string;
    RPC_URL: string;
    CONTRACT_ID: string;
    NETWORK_PASSPHRASE: string;
    KALE_TOKEN_ADDRESS: string;
  };
  
  // Weather API configuration
  WEATHER: {
    OPENWEATHER_API_KEY: string;
    WEATHERAPI_KEY: string;
    VISUAL_CROSSING_API_KEY: string;
    DEFAULT_LOCATION: string;
    CACHE_TTL_MS: number;
  };
  
  // Farming automation configuration
  FARMING: {
    AUTOMATION_INTERVAL_MS: number;
    WORK_DELAY_BLOCKS: number;
    HARVEST_DELAY_BLOCKS: number;
    MAX_ERRORS: number;
    MIN_STAKE_AMOUNT: bigint;
    MAX_STAKE_AMOUNT: bigint;
  };
  
  // Deposit monitoring configuration
  DEPOSIT_MONITOR: {
    POLL_INTERVAL_MS: number;
    CONFIRMATION_BLOCKS: number;
  };
  
  // Cycle configuration
  CYCLE: {
    LENGTH_BLOCKS: number;
    START_BLOCK: bigint;
    PLANTING_BLOCKS: number;
    WORKING_BLOCKS: number;
    REVEALING_BLOCKS: number;
    SETTLING_BLOCKS: number;
  };
  
  // Weather integration settings
  WEATHER_INTEGRATION: {
    BASE_GOOD_MULTIPLIER: number;
    BASE_BAD_MULTIPLIER: number;
    CONFIDENCE_BONUS_MAX: number;
  };
  
  // Security settings
  SECURITY: {
    ENCRYPTION_KEY: string;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX: number;
  };
  
  // Debug settings
  DEBUG: {
    ENDPOINTS_ENABLED: boolean;
    DETAILED_LOGGING: boolean;
  };
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function validateEnvironmentVariable(name: string, value: string | undefined, required: boolean = true): string {
  if (!value && required) {
    throw new ConfigurationError(`Required environment variable ${name} is not set`);
  }
  
  if (value && value.trim() === '') {
    throw new ConfigurationError(`Environment variable ${name} cannot be empty`);
  }
  
  return value || '';
}

function validateNumericEnvironmentVariable(name: string, value: string | undefined, required: boolean = true, defaultValue?: number): number {
  const stringValue = validateEnvironmentVariable(name, value, required);
  
  if (!stringValue && !required && defaultValue !== undefined) {
    return defaultValue;
  }
  
  const numericValue = parseInt(stringValue);
  
  if (isNaN(numericValue)) {
    throw new ConfigurationError(`Environment variable ${name} must be a valid number, got: ${stringValue}`);
  }
  
  if (numericValue < 0) {
    throw new ConfigurationError(`Environment variable ${name} must be a positive number, got: ${numericValue}`);
  }
  
  return numericValue;
}

function validateBooleanEnvironmentVariable(name: string, value: string | undefined, required: boolean = false, defaultValue: boolean = false): boolean {
  if (!value && !required) {
    return defaultValue;
  }
  
  const stringValue = validateEnvironmentVariable(name, value, required);
  return stringValue.toLowerCase() === 'true';
}

function validateBigIntEnvironmentVariable(name: string, value: string | undefined, required: boolean = true, defaultValue?: bigint): bigint {
  const stringValue = validateEnvironmentVariable(name, value, required);
  
  if (!stringValue && !required && defaultValue !== undefined) {
    return defaultValue;
  }
  
  try {
    return BigInt(stringValue);
  } catch (error) {
    throw new ConfigurationError(`Environment variable ${name} must be a valid big integer, got: ${stringValue}`);
  }
}

function parseCorsOrigins(corsOrigin: string | undefined): string[] {
  if (!corsOrigin) {
    return ['http://localhost:3000']; // default
  }
  
  return corsOrigin.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
}

function loadConfig(): KaleWeatherFarmingConfig {
  try {
    const config: KaleWeatherFarmingConfig = {
      // Core settings
      NODE_ENV: validateEnvironmentVariable('NODE_ENV', process.env.NODE_ENV, false) || 'development',
      LOG_LEVEL: validateEnvironmentVariable('LOG_LEVEL', process.env.LOG_LEVEL, false) || 'info',
      
      // Server settings
      SERVER: {
        HOST: validateEnvironmentVariable('HOST', process.env.HOST, false) || '0.0.0.0',
        PORT: validateNumericEnvironmentVariable('PORT', process.env.PORT, false, 3000),
        CORS_ORIGIN: parseCorsOrigins(process.env.CORS_ORIGIN),
        JWT_SECRET: validateEnvironmentVariable('JWT_SECRET', process.env.JWT_SECRET, false) || 'dev-secret-key-change-in-production-' + Math.random().toString(36),
        JWT_EXPIRES_IN: validateNumericEnvironmentVariable('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN, false, 3600),
        ALLOWED_ORIGINS: parseCorsOrigins(process.env.ALLOWED_ORIGINS),
      },
      
      // Database configuration
      DATABASE: {
        HOST: validateEnvironmentVariable('POSTGRES_HOST', process.env.POSTGRES_HOST),
        PORT: validateNumericEnvironmentVariable('POSTGRES_PORT', process.env.POSTGRES_PORT, false, 5432),
        NAME: validateEnvironmentVariable('POSTGRES_DB', process.env.POSTGRES_DB),
        USER: validateEnvironmentVariable('POSTGRES_USER', process.env.POSTGRES_USER),
        PASSWORD: validateEnvironmentVariable('POSTGRES_PASSWORD', process.env.POSTGRES_PASSWORD),
        SSL: validateBooleanEnvironmentVariable('POSTGRES_SSL', process.env.POSTGRES_SSL, false, false),
        POOL_SIZE: validateNumericEnvironmentVariable('DATABASE_POOL_SIZE', process.env.DATABASE_POOL_SIZE, false, 20),
        TIMEOUT_MS: validateNumericEnvironmentVariable('DATABASE_TIMEOUT_MS', process.env.DATABASE_TIMEOUT_MS, false, 30000),
      },
      
      // Stellar network configuration
      STELLAR: {
        NETWORK: validateEnvironmentVariable('STELLAR_NETWORK', process.env.STELLAR_NETWORK, false) || 'testnet',
        RPC_URL: validateEnvironmentVariable('STELLAR_RPC_URL', process.env.STELLAR_RPC_URL, false) || 'https://horizon-testnet.stellar.org',
        CONTRACT_ID: validateEnvironmentVariable('STELLAR_CONTRACT_ID', process.env.STELLAR_CONTRACT_ID),
        NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK === 'mainnet' 
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015',
        KALE_TOKEN_ADDRESS: validateEnvironmentVariable('KALE_TOKEN_ADDRESS', process.env.KALE_TOKEN_ADDRESS),
      },
      
      // Weather API configuration
      WEATHER: {
        OPENWEATHER_API_KEY: validateEnvironmentVariable('OPENWEATHER_API_KEY', process.env.OPENWEATHER_API_KEY),
        WEATHERAPI_KEY: validateEnvironmentVariable('WEATHERAPI_KEY', process.env.WEATHERAPI_KEY),
        VISUAL_CROSSING_API_KEY: validateEnvironmentVariable('VISUAL_CROSSING_API_KEY', process.env.VISUAL_CROSSING_API_KEY),
        DEFAULT_LOCATION: validateEnvironmentVariable('DEFAULT_LOCATION', process.env.DEFAULT_LOCATION, false) || 'New York,NY,US',
        CACHE_TTL_MS: validateNumericEnvironmentVariable('WEATHER_CACHE_TTL_MS', process.env.WEATHER_CACHE_TTL_MS, false, 300000), // 5 minutes
      },
      
      // Farming automation configuration
      FARMING: {
        AUTOMATION_INTERVAL_MS: validateNumericEnvironmentVariable('FARMING_AUTOMATION_INTERVAL_MS', process.env.FARMING_AUTOMATION_INTERVAL_MS, false, 5000),
        WORK_DELAY_BLOCKS: validateNumericEnvironmentVariable('FARMING_WORK_DELAY_BLOCKS', process.env.FARMING_WORK_DELAY_BLOCKS, false, 24),
        HARVEST_DELAY_BLOCKS: validateNumericEnvironmentVariable('FARMING_HARVEST_DELAY_BLOCKS', process.env.FARMING_HARVEST_DELAY_BLOCKS, false, 48),
        MAX_ERRORS: validateNumericEnvironmentVariable('FARMING_MAX_ERRORS', process.env.FARMING_MAX_ERRORS, false, 10),
        MIN_STAKE_AMOUNT: validateBigIntEnvironmentVariable('FARMING_MIN_STAKE_AMOUNT', process.env.FARMING_MIN_STAKE_AMOUNT, false, 1000000n), // 0.1 KALE
        MAX_STAKE_AMOUNT: validateBigIntEnvironmentVariable('FARMING_MAX_STAKE_AMOUNT', process.env.FARMING_MAX_STAKE_AMOUNT, false, 10000000000n), // 1000 KALE
      },
      
      // Deposit monitoring configuration
      DEPOSIT_MONITOR: {
        POLL_INTERVAL_MS: validateNumericEnvironmentVariable('DEPOSIT_MONITOR_INTERVAL_MS', process.env.DEPOSIT_MONITOR_INTERVAL_MS, false, 10000),
        CONFIRMATION_BLOCKS: validateNumericEnvironmentVariable('DEPOSIT_CONFIRMATION_BLOCKS', process.env.DEPOSIT_CONFIRMATION_BLOCKS, false, 2),
      },
      
      // Cycle configuration
      CYCLE: {
        LENGTH_BLOCKS: validateNumericEnvironmentVariable('CYCLE_LENGTH_BLOCKS', process.env.CYCLE_LENGTH_BLOCKS, false, 500),
        START_BLOCK: validateBigIntEnvironmentVariable('CYCLE_START_BLOCK', process.env.CYCLE_START_BLOCK, false, 1000000n),
        PLANTING_BLOCKS: validateNumericEnvironmentVariable('CYCLE_PLANTING_BLOCKS', process.env.CYCLE_PLANTING_BLOCKS, false, 200),
        WORKING_BLOCKS: validateNumericEnvironmentVariable('CYCLE_WORKING_BLOCKS', process.env.CYCLE_WORKING_BLOCKS, false, 200),
        REVEALING_BLOCKS: validateNumericEnvironmentVariable('CYCLE_REVEALING_BLOCKS', process.env.CYCLE_REVEALING_BLOCKS, false, 50),
        SETTLING_BLOCKS: validateNumericEnvironmentVariable('CYCLE_SETTLING_BLOCKS', process.env.CYCLE_SETTLING_BLOCKS, false, 50),
      },
      
      // Weather integration settings
      WEATHER_INTEGRATION: {
        BASE_GOOD_MULTIPLIER: parseFloat(process.env.WEATHER_GOOD_MULTIPLIER || '1.5'),
        BASE_BAD_MULTIPLIER: parseFloat(process.env.WEATHER_BAD_MULTIPLIER || '0.5'),
        CONFIDENCE_BONUS_MAX: parseFloat(process.env.WEATHER_CONFIDENCE_BONUS_MAX || '0.25'),
      },
      
      // Security settings
      SECURITY: {
        ENCRYPTION_KEY: validateEnvironmentVariable('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY, false) || 'dev-encryption-key-change-in-production-' + Math.random().toString(36),
        RATE_LIMIT_WINDOW_MS: validateNumericEnvironmentVariable('RATE_LIMIT_WINDOW_MS', process.env.RATE_LIMIT_WINDOW_MS, false, 900000), // 15 minutes
        RATE_LIMIT_MAX: validateNumericEnvironmentVariable('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX, false, 100),
      },
      
      // Debug settings
      DEBUG: {
        ENDPOINTS_ENABLED: validateBooleanEnvironmentVariable('ENABLE_DEBUG_ENDPOINTS', process.env.ENABLE_DEBUG_ENDPOINTS, false, false),
        DETAILED_LOGGING: validateBooleanEnvironmentVariable('DETAILED_LOGGING', process.env.DETAILED_LOGGING, false, false),
      },
    };
    
    // Validate specific values
    if (!['development', 'production', 'test'].includes(config.NODE_ENV)) {
      throw new ConfigurationError(`NODE_ENV must be one of: development, production, test. Got: ${config.NODE_ENV}`);
    }
    
    if (!['error', 'warn', 'info', 'debug'].includes(config.LOG_LEVEL)) {
      throw new ConfigurationError(`LOG_LEVEL must be one of: error, warn, info, debug. Got: ${config.LOG_LEVEL}`);
    }
    
    if (config.SERVER.PORT < 1024 || config.SERVER.PORT > 65535) {
      throw new ConfigurationError(`PORT must be between 1024 and 65535. Got: ${config.SERVER.PORT}`);
    }
    
    if (!['mainnet', 'testnet', 'futurenet'].includes(config.STELLAR.NETWORK)) {
      throw new ConfigurationError(`STELLAR_NETWORK must be one of: mainnet, testnet, futurenet. Got: ${config.STELLAR.NETWORK}`);
    }
    
    if (!config.STELLAR.RPC_URL.startsWith('http')) {
      throw new ConfigurationError(`STELLAR_RPC_URL must be a valid URL starting with http/https. Got: ${config.STELLAR.RPC_URL}`);
    }
    
    // Validate Stellar addresses format
    if (!/^G[A-Z0-9]{55}$/.test(config.STELLAR.KALE_TOKEN_ADDRESS)) {
      throw new ConfigurationError(`KALE_TOKEN_ADDRESS must be a valid Stellar account address starting with G`);
    }
    
    if (!/^C[A-Z0-9]{55}$/.test(config.STELLAR.CONTRACT_ID)) {
      throw new ConfigurationError(`STELLAR_CONTRACT_ID must be a valid Stellar contract address starting with C`);
    }
    
    // Validate database configuration
    if (config.DATABASE.PORT < 1024 || config.DATABASE.PORT > 65535) {
      throw new ConfigurationError(`POSTGRES_PORT must be between 1024 and 65535. Got: ${config.DATABASE.PORT}`);
    }
    
    // Validate weather API keys
    if (config.WEATHER.OPENWEATHER_API_KEY.length < 10) {
      throw new ConfigurationError(`OPENWEATHER_API_KEY appears too short`);
    }
    
    if (config.WEATHER.WEATHERAPI_KEY.length < 10) {
      throw new ConfigurationError(`WEATHERAPI_KEY appears too short`);
    }
    
    if (config.WEATHER.VISUAL_CROSSING_API_KEY.length < 10) {
      throw new ConfigurationError(`VISUAL_CROSSING_API_KEY appears too short`);
    }
    
    return config;
    
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let Config: KaleWeatherFarmingConfig;

try {
  Config = loadConfig();
  console.log(`[Config] ✅ Configuration loaded successfully for ${Config.NODE_ENV} environment`);
  console.log(`[Config] 🌾 KALE Weather Farming System - ${Config.STELLAR.NETWORK} network`);
  console.log(`[Config] 🔗 Database: ${Config.DATABASE.HOST}:${Config.DATABASE.PORT}/${Config.DATABASE.NAME}`);
  console.log(`[Config] 🌐 Server: ${Config.SERVER.HOST}:${Config.SERVER.PORT}`);
  
  // Log warnings for development defaults
  if (Config.NODE_ENV === 'development') {
    if (Config.SERVER.JWT_SECRET.includes('dev-secret-key')) {
      console.warn('[Config] ⚠️  Using development JWT secret - change in production!');
    }
    if (Config.SECURITY.ENCRYPTION_KEY.includes('dev-encryption-key')) {
      console.warn('[Config] ⚠️  Using development encryption key - change in production!');
    }
  }
  
} catch (error) {
  console.error('[Config] ❌ Configuration Error:', error instanceof Error ? error.message : String(error));
  console.error('[Config] 💡 Please check your .env file and ensure all required variables are set correctly.');
  console.error('[Config] 📖 See README.md for configuration requirements.');
  process.exit(1);
}

export { Config, ConfigurationError, loadConfig };
export type { KaleWeatherFarmingConfig };
export default Config;