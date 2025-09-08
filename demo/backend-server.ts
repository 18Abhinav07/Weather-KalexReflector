#!/usr/bin/env bun
import express from 'express';
import cors from 'cors';
import { db } from '../src/database/connection.js';
import LocationSelector from '../src/services/locationSelector.js';
import WeatherApiService from '../src/services/weatherApiService.js';
import WagerService, { WagerDirection } from '../src/services/wagerService.js';
import FinalWeatherCalculator from '../src/services/finalWeatherCalculator.js';
import logger from '../src/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Services
let locationSelector: LocationSelector;
let weatherService: WeatherApiService;
let wagerService: WagerService;
let weatherCalculator: FinalWeatherCalculator;

// Demo State
let currentCycle: bigint;
let currentBlock = 1;
let cycleState: 'planting' | 'working' | 'revealing' | 'completed' = 'planting';
let selectedLocation: any = null;
let finalResults: any = null;

// Block progression timer
let blockTimer: NodeJS.Timeout;

interface UserAction {
  userId: string;
  blockNumber: number;
  actionType: 'agriculture' | 'wager' | 'stay';
  actionData: any;
  timestamp: Date;
}

const userActions: UserAction[] = [];

// Initialize services
async function initializeServices() {
  try {
    locationSelector = new LocationSelector();
    weatherService = new WeatherApiService();
    wagerService = new WagerService();
    weatherCalculator = new FinalWeatherCalculator();
    
    // Create new demo cycle
    currentCycle = BigInt(Date.now());
    
    // Setup demo users if not exist
    await setupDemoUsers();
    
    // Create demo cycle
    await db.query(`
      INSERT INTO weather_cycles (
        cycle_id, start_block, current_block, current_state, created_at
      ) VALUES ($1, 1, 1, 'planting', NOW())
      ON CONFLICT (cycle_id) DO NOTHING
    `, [currentCycle]);
    
    logger.info(`🚀 Demo backend initialized with cycle ${currentCycle}`);
    
    // Start block progression
    startBlockProgression();
    
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

async function setupDemoUsers() {
  const demoUsers = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Alice',
      wallet: 'GCKFBEIYTKP56NQEX5YTIMN2WVPXBDLYENZHFG4E5W4Q5D6JJVX2ZZZ1',
      custodial: 'GCXXDNBCXI5HZXJX6XUGWRKXWZ7KQZSJRZXFYB5SXZNXQXJZXBZXCZX1',
      balance: 10000
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Bob',
      wallet: 'GCKFBEIYTKP56NQEX5YTIMN2WVPXBDLYENZHFG4E5W4Q5D6JJVX2ZZZ2',
      custodial: 'GCXXDNBCXI5HZXJX6XUGWRKXWZ7KQZSJRZXFYB5SXZNXQXJZXBZXCZX2',
      balance: 5000
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'Charlie',
      wallet: 'GCKFBEIYTKP56NQEX5YTIMN2WVPXBDLYENZHFG4E5W4Q5D6JJVX2ZZZ3',
      custodial: 'GCXXDNBCXI5HZXJX6XUGWRKXWZ7KQZSJRZXFYB5SXZNXQXJZXBZXCZX3',
      balance: 7500
    }
  ];

  for (const user of demoUsers) {
    await db.query(`
      INSERT INTO users (user_id, main_wallet_address, custodial_wallet_address) 
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
    `, [user.id, user.wallet, user.custodial]);

    await db.query(`
      INSERT INTO custodial_wallets (wallet_address, encrypted_private_key, user_id, current_balance)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (wallet_address) DO NOTHING
    `, [user.custodial, 'encrypted_demo_key', user.id, user.balance * 10000000]);
  }
}

function startBlockProgression() {
  blockTimer = setInterval(async () => {
    currentBlock++;
    
    logger.info(`📍 BLOCK ${currentBlock} - State: ${cycleState}`);
    
    // Update database
    await db.query(`
      UPDATE weather_cycles SET current_block = $1 WHERE cycle_id = $2
    `, [currentBlock, currentCycle]);
    
    // Handle state transitions
    if (currentBlock === 6) {
      cycleState = 'working';
      await handleLocationReveal();
    } else if (currentBlock === 9) {
      cycleState = 'revealing';
      await handleWeatherCalculation();
    } else if (currentBlock === 10) {
      cycleState = 'completed';
      await handleFinalSettlement();
      clearInterval(blockTimer);
    }
    
    // Broadcast block update to all connected users
    broadcastBlockUpdate();
    
  }, 3000); // 3 seconds per block
}

async function handleLocationReveal() {
  try {
    selectedLocation = await locationSelector.selectLocationForCycle(Number(currentCycle));
    
    await db.query(`
      UPDATE weather_cycles 
      SET revealed_location_id = $1, 
          revealed_location_name = $2,
          revealed_location_coordinates = $3,
          location_revealed_at = NOW(),
          current_state = 'working'
      WHERE cycle_id = $4
    `, [
      selectedLocation.id, 
      selectedLocation.name, 
      JSON.stringify(selectedLocation.coordinates),
      currentCycle
    ]);
    
    logger.info(`🌍 LOCATION REVEALED: ${selectedLocation.name}`);
  } catch (error) {
    logger.error('Location reveal failed:', error);
  }
}

async function handleWeatherCalculation() {
  try {
    if (!selectedLocation) return;
    
    // Fetch real weather data
    const weatherResult = await weatherService.fetchWeatherForLocation(selectedLocation);
    
    if (weatherResult.success && weatherResult.weather) {
      await db.query(`
        UPDATE weather_cycles 
        SET current_weather_data = $1,
            final_weather_score = $2,
            weather_source = $3,
            current_state = 'revealing'
        WHERE cycle_id = $4
      `, [
        JSON.stringify(weatherResult.weather.data),
        weatherResult.weather.score,
        weatherResult.weather.source,
        currentCycle
      ]);
    }
    
    logger.info(`🌤️  Weather calculated: ${weatherResult.weather?.score} points`);
  } catch (error) {
    logger.error('Weather calculation failed:', error);
  }
}

async function handleFinalSettlement() {
  try {
    // Calculate final outcome (simplified)
    const weatherOutcome = Math.random() > 0.4 ? 'GOOD' : 'BAD'; // 60% chance GOOD
    
    await db.query(`
      UPDATE weather_cycles 
      SET current_state = 'completed',
          weather_outcome = $1,
          weather_confidence = 0.75,
          completed_at = NOW(),
          weather_resolved_at = NOW()
      WHERE cycle_id = $2
    `, [weatherOutcome, currentCycle]);
    
    // Calculate user rewards
    finalResults = await calculateUserRewards(weatherOutcome);
    
    logger.info(`🏆 CYCLE COMPLETED! Final outcome: ${weatherOutcome}`);
    logger.info('Final Results:', finalResults);
  } catch (error) {
    logger.error('Final settlement failed:', error);
  }
}

async function calculateUserRewards(outcome: 'GOOD' | 'BAD') {
  const results = [];
  
  for (const action of userActions) {
    if (action.actionType === 'wager') {
      const won = (action.actionData.direction === 'good' && outcome === 'GOOD') ||
                  (action.actionData.direction === 'bad' && outcome === 'BAD');
      const payout = won ? action.actionData.amount * 1.5 : 0;
      
      results.push({
        userId: action.userId,
        type: 'wager',
        amount: action.actionData.amount,
        direction: action.actionData.direction,
        won,
        payout
      });
    } else if (action.actionType === 'agriculture') {
      const weatherMultiplier = outcome === 'GOOD' ? 1.2 : 0.8;
      const baseReward = action.actionData.amount * 0.1;
      const finalReward = baseReward * weatherMultiplier;
      
      results.push({
        userId: action.userId,
        type: 'agriculture',
        planted: action.actionData.amount,
        baseReward,
        weatherMultiplier,
        finalReward
      });
    }
  }
  
  return results;
}

function broadcastBlockUpdate() {
  // In a real implementation, you'd use WebSockets
  // For demo, we'll just log the update
  logger.info(`📢 Broadcasting block ${currentBlock} update to all users`);
}

// API Routes

// Get current cycle status
app.get('/api/cycle/status', (req, res) => {
  res.json({
    cycleId: currentCycle.toString(),
    currentBlock,
    cycleState,
    selectedLocation,
    totalBlocks: 10,
    phase: currentBlock <= 5 ? 'wager' : currentBlock <= 8 ? 'agriculture' : 'settlement'
  });
});

// Get user balance
app.get('/api/users/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query(`
      SELECT current_balance FROM custodial_wallets 
      WHERE user_id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      balance: result.rows[0].current_balance / 10000000, // Convert from stroops
      balanceStroops: result.rows[0].current_balance
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Submit user action
app.post('/api/users/:userId/actions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { actionType, actionData } = req.body;
    
    // Validate action based on current phase
    // Blocks 1-5: Both wager AND agriculture allowed
    // Blocks 6+: Only agriculture allowed (no more wagers)
    if (currentBlock > 5 && actionType === 'wager') {
      return res.status(400).json({ error: 'Wagers not allowed after block 5 (location reveal)' });
    }
    
    // Record action
    const action: UserAction = {
      userId,
      blockNumber: currentBlock,
      actionType,
      actionData,
      timestamp: new Date()
    };
    
    userActions.push(action);
    
    // Store in database
    await db.query(`
      INSERT INTO cycle_actions (user_id, cycle_id, block_number, action_type, action_data)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, cycle_id, block_number) 
      DO UPDATE SET action_type = $4, action_data = $5
    `, [userId, currentCycle, currentBlock, actionType, JSON.stringify(actionData)]);
    
    logger.info(`📝 Block ${currentBlock}: User ${userId} - ${actionType}`, actionData);
    
    res.json({
      success: true,
      action,
      message: `${actionType} action recorded for block ${currentBlock}`
    });
    
  } catch (error) {
    logger.error('Action submission failed:', error);
    res.status(500).json({ error: 'Failed to submit action' });
  }
});

// Get cycle results
app.get('/api/cycle/results', (req, res) => {
  if (cycleState !== 'completed') {
    return res.status(400).json({ error: 'Cycle not yet completed' });
  }
  
  res.json({
    cycleId: currentCycle.toString(),
    finalResults,
    totalActions: userActions.length,
    completedAt: new Date()
  });
});

// Get user's actions history
app.get('/api/users/:userId/actions', (req, res) => {
  const { userId } = req.params;
  const userActionsHistory = userActions.filter(a => a.userId === userId);
  
  res.json({
    userId,
    actions: userActionsHistory,
    totalActions: userActionsHistory.length
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    cycle: currentCycle.toString(),
    block: currentBlock,
    phase: cycleState
  });
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('API Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    logger.info(`🚀 KALE Weather Farming Backend Server running on port ${PORT}`);
    logger.info(`📡 API endpoints available at http://localhost:${PORT}/api/`);
    logger.info(`🎮 Demo cycle ${currentCycle} started - Block progression every 3 seconds`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down backend server...');
  if (blockTimer) clearInterval(blockTimer);
  process.exit(0);
});

// Start the demo
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});