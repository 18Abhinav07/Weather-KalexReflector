// Environment Variable Validation Utility
// Validates and loads required environment variables on server startup

interface EnvConfig {
  // Database Configuration
  POSTGRES_HOST: string;
  POSTGRES_PORT: string;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  
  // Stellar Configuration
  STELLAR_NETWORK: string;
  STELLAR_RPC_URL: string;
  STELLAR_CONTRACT_ID: string;
  KALE_TOKEN_ADDRESS: string;
  
  // Weather API Configuration
  OPENWEATHER_API_KEY: string;
  WEATHERAPI_KEY: string;
  VISUAL_CROSSING_API_KEY: string;
  
  // Application Configuration
  PORT: string;
  NODE_ENV: string;
  
  // Optional Configuration
  ENCRYPTION_KEY?: string;
  JWT_SECRET?: string;
}

interface ValidationResult {
  valid: boolean;
  missingVars: string[];
  invalidVars: string[];
  warnings: string[];
}

export class EnvironmentValidator {
  private static requiredVars: (keyof EnvConfig)[] = [
    'POSTGRES_HOST',
    'POSTGRES_PORT', 
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'STELLAR_NETWORK',
    'STELLAR_RPC_URL',
    'STELLAR_CONTRACT_ID',
    'KALE_TOKEN_ADDRESS',
    'OPENWEATHER_API_KEY',
    'WEATHERAPI_KEY',
    'VISUAL_CROSSING_API_KEY',
    'PORT',
    'NODE_ENV'
  ];

  private static optionalVars: (keyof EnvConfig)[] = [
    'ENCRYPTION_KEY',
    'JWT_SECRET'
  ];

  /**
   * Validate all environment variables
   */
  static validate(): ValidationResult {
    const missingVars: string[] = [];
    const invalidVars: string[] = [];
    const warnings: string[] = [];

    console.log('🔍 Validating environment variables...');

    // Check required variables
    for (const varName of this.requiredVars) {
      const value = process.env[varName];
      
      if (!value || value.trim() === '') {
        missingVars.push(varName);
      } else {
        // Validate specific formats
        const validation = this.validateSpecificVar(varName, value);
        if (!validation.valid) {
          invalidVars.push(`${varName}: ${validation.error}`);
        }
        if (validation.warning) {
          warnings.push(`${varName}: ${validation.warning}`);
        }
      }
    }

    // Check optional variables and warn if missing
    for (const varName of this.optionalVars) {
      const value = process.env[varName];
      if (!value || value.trim() === '') {
        warnings.push(`${varName} is not set (optional but recommended)`);
      }
    }

    const valid = missingVars.length === 0 && invalidVars.length === 0;

    if (valid) {
      console.log('✅ All required environment variables are valid');
    } else {
      console.error('❌ Environment validation failed');
    }

    if (warnings.length > 0) {
      console.warn('⚠️  Environment warnings detected');
    }

    return {
      valid,
      missingVars,
      invalidVars,
      warnings
    };
  }

  /**
   * Validate specific variable formats
   */
  private static validateSpecificVar(varName: string, value: string): { valid: boolean; error?: string; warning?: string } {
    switch (varName) {
      case 'POSTGRES_PORT':
        const port = parseInt(value);
        if (isNaN(port) || port < 1 || port > 65535) {
          return { valid: false, error: 'must be a valid port number (1-65535)' };
        }
        break;

      case 'STELLAR_NETWORK':
        if (!['mainnet', 'testnet'].includes(value.toLowerCase())) {
          return { valid: false, error: 'must be either "mainnet" or "testnet"' };
        }
        if (value.toLowerCase() === 'mainnet') {
          return { valid: true, warning: 'using mainnet - ensure this is intended for production' };
        }
        break;

      case 'STELLAR_RPC_URL':
        try {
          new URL(value);
        } catch {
          return { valid: false, error: 'must be a valid URL' };
        }
        break;

      case 'STELLAR_CONTRACT_ID':
        if (!/^C[A-Z0-9]{55}$/.test(value)) {
          return { valid: false, error: 'must be a valid Stellar contract address starting with C' };
        }
        break;

      case 'KALE_TOKEN_ADDRESS':
        if (!/^G[A-Z0-9]{55}$/.test(value)) {
          return { valid: false, error: 'must be a valid Stellar account address starting with G' };
        }
        break;

      case 'OPENWEATHER_API_KEY':
      case 'WEATHERAPI_KEY':
      case 'VISUAL_CROSSING_API_KEY':
        if (value.length < 10) {
          return { valid: false, error: 'API key appears too short' };
        }
        break;

      case 'PORT':
        const appPort = parseInt(value);
        if (isNaN(appPort) || appPort < 1000 || appPort > 65535) {
          return { valid: false, error: 'must be a valid port number (1000-65535)' };
        }
        break;

      case 'NODE_ENV':
        if (!['development', 'production', 'test'].includes(value.toLowerCase())) {
          return { valid: false, error: 'must be development, production, or test' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Print validation results
   */
  static printResults(result: ValidationResult): void {
    if (result.missingVars.length > 0) {
      console.error('\n❌ Missing Required Environment Variables:');
      result.missingVars.forEach(varName => {
        console.error(`  - ${varName}`);
      });
    }

    if (result.invalidVars.length > 0) {
      console.error('\n❌ Invalid Environment Variables:');
      result.invalidVars.forEach(error => {
        console.error(`  - ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Environment Warnings:');
      result.warnings.forEach(warning => {
        console.warn(`  - ${warning}`);
      });
    }

    if (!result.valid) {
      console.error('\n💡 Please check your .env file and ensure all required variables are set correctly.');
      console.error('   Example .env file should include:');
      console.error('   POSTGRES_HOST=localhost');
      console.error('   POSTGRES_PORT=5432');
      console.error('   STELLAR_NETWORK=testnet');
      console.error('   STELLAR_CONTRACT_ID=C...');
      console.error('   And all other required variables listed above.\n');
    }
  }

  /**
   * Get typed environment configuration (only call after validation passes)
   */
  static getConfig(): EnvConfig {
    return {
      POSTGRES_HOST: process.env.POSTGRES_HOST!,
      POSTGRES_PORT: process.env.POSTGRES_PORT!,
      POSTGRES_DB: process.env.POSTGRES_DB!,
      POSTGRES_USER: process.env.POSTGRES_USER!,
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
      STELLAR_NETWORK: process.env.STELLAR_NETWORK!,
      STELLAR_RPC_URL: process.env.STELLAR_RPC_URL!,
      STELLAR_CONTRACT_ID: process.env.STELLAR_CONTRACT_ID!,
      KALE_TOKEN_ADDRESS: process.env.KALE_TOKEN_ADDRESS!,
      OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY!,
      WEATHERAPI_KEY: process.env.WEATHERAPI_KEY!,
      VISUAL_CROSSING_API_KEY: process.env.VISUAL_CROSSING_API_KEY!,
      PORT: process.env.PORT!,
      NODE_ENV: process.env.NODE_ENV!,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      JWT_SECRET: process.env.JWT_SECRET
    };
  }
}

// Validate immediately when module is loaded (for early detection)
if (process.env.NODE_ENV !== 'test') {
  const result = EnvironmentValidator.validate();
  EnvironmentValidator.printResults(result);
  
  if (!result.valid) {
    console.error('🚨 Server startup aborted due to environment validation failures');
    process.exit(1);
  }
}

export const envConfig = EnvironmentValidator.getConfig();