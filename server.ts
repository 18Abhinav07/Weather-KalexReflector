#!/usr/bin/env bun
// KALE DAO Oracle System Server Entry Point

import { createDAOOracleSystem, type SystemConfig } from './src/dao-oracle-system';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const config: SystemConfig = {
  rpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
  port: parseInt(process.env.PORT || '3000'),
  stellarNetwork: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
  logLevel: (process.env.LOG_LEVEL as any) || 'info'
};

// Validate configuration
if (!config.rpcUrl) {
  console.error(chalk.red('❌ STELLAR_RPC_URL is required'));
  process.exit(1);
}

console.log(chalk.blue('🚀 Starting KALE DAO Oracle System...'));
console.log(chalk.gray(`   Network: ${config.stellarNetwork}`));
console.log(chalk.gray(`   RPC URL: ${config.rpcUrl}`));
console.log(chalk.gray(`   Port: ${config.port}`));

// Create and start the system
const system = createDAOOracleSystem(config);

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGINT, shutting down gracefully...'));
  await system.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down gracefully...'));
  await system.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

// Start the system
try {
  await system.start();
  
  // Health check
  const health = system.getHealthStatus();
  if (health.status === 'healthy') {
    console.log(chalk.green('✅ System is healthy and ready to accept requests'));
  } else {
    console.warn(chalk.yellow('⚠️ System started but health check shows issues'));
  }

  // Example: Simulate a test voting cycle every 5 minutes in development
  if (process.env.NODE_ENV === 'development') {
    console.log(chalk.cyan('🔄 Development mode: Will run test voting cycles every 5 minutes'));
    
    setInterval(async () => {
      try {
        const blockIndex = Math.floor(Date.now() / 1000); // Mock block index
        const blockEntropy = Math.random().toString(36).substring(2, 18); // Mock entropy
        
        console.log(chalk.dim(`\n--- Test Voting Cycle ${blockIndex} ---`));
        const result = await system.performVotingCycleWithEntropy(blockIndex, blockEntropy);
        console.log(chalk.green(`✅ Test cycle completed: ${result.finalWeather === 1 ? 'GOOD' : 'BAD'} weather`));
      } catch (error) {
        console.error(chalk.red('❌ Test voting cycle failed:'), error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
  
} catch (error) {
  console.error(chalk.red('❌ Failed to start system:'), error);
  process.exit(1);
}