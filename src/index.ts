// KALE Weather Farming System - Main Entry Point
// Phase 1 Implementation per SRS Requirements

import { weatherFarmingServer } from './app';

async function main() {
  try {
    console.log('🌾 KALE Weather Farming System - Phase 1');
    console.log('=========================================');
    console.log('Implementing SRS Requirements:');
    console.log('- REQ-001: User Registration & Custodial Wallets');
    console.log('- REQ-002: KALE Deposit & Withdrawal Management'); 
    console.log('- REQ-003: Plant Request Validation & Queueing');
    console.log('- REQ-004: Automated Plant Execution');
    console.log('- REQ-005: Automated Work Processing');
    console.log('- REQ-006: Weather Outcome Integration');
    console.log('- REQ-007: Harvest & Settlement System');
    console.log('=========================================');
    
    await weatherFarmingServer.start();
  } catch (error) {
    console.error('Failed to start Weather Farming System:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();