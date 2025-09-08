#!/usr/bin/env bun
import express from 'express';
import cors from 'cors';
import { db } from '../src/database/connection.js';
import LocationSelector from '../src/services/locationSelector.js';
import WeatherApiService from '../src/services/weatherApiService.js';
import WagerService, { WagerDirection } from '../src/services/wagerService.js';
import logger from '../src/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Enhanced game configuration
const BLOCK_DURATION = 15000; // 15 seconds per block
const TOTAL_BLOCKS = 10;

app.use(cors());
app.use(express.json());

// Services
let locationSelector: LocationSelector;
let weatherService: WeatherApiService;
let wagerService: WagerService;

// Game State
let currentCycle: bigint;
let currentBlock = 0;
let cycleState: 'planting' | 'working' | 'revealing' | 'completed' = 'planting';
let selectedLocation: any = null;
let weatherOutcome: 'GOOD' | 'BAD' | null = null;
let blockTimer: NodeJS.Timeout;

// DAO Votes (simulated but realistic)
let daoVotes = {
  bull: { prediction: 'GOOD', confidence: 0.0, revealed: false },
  bear: { prediction: 'BAD', confidence: 0.0, revealed: false },
  technical: { prediction: 'GOOD', confidence: 0.0, revealed: false },
  sentiment: { prediction: 'BAD', confidence: 0.0, revealed: false }
};

// Game pools for reward calculations
let wagerPool = { good: 0, bad: 0, total: 0 };
let plantPool = { totalPlanted: 0, totalStored: 0 };

interface UserAction {
  userId: string;
  blockNumber: number;
  actionType: 'wager' | 'plant' | 'store' | 'stay';
  actionData: any;
  timestamp: Date;
}

const userActions: UserAction[] = [];
const connectedUsers = new Set<string>();

async function startCycle() {
  // Start the block timer
  blockTimer = setInterval(async () => {
    currentBlock++;
    
    logger.info(`\n🚨 BLOCK ${currentBlock} STARTED at ${new Date().toLocaleTimeString()}`);
    logger.info(`${'='.repeat(60)}`);
    
    if (currentBlock === 2) {
      await handleBlockEvents();
    }
    
    if (currentBlock === 6) {
      await handleBlockEvents();
    }
    
    if (currentBlock === 10) {
      await handleWeatherReveal();
      await handleCycleCompletion();
      clearInterval(blockTimer);
      blockTimer = null;
    }
    
    await notifyAllUsers();
  }, BLOCK_DURATION);
}

async function initializeServices() {
  try {
    locationSelector = new LocationSelector();
    weatherService = new WeatherApiService();
    wagerService = new WagerService();
    
    currentCycle = BigInt(Date.now());
    
    await setupDemoUsers();
    await createDemoCycle();
    
    // Generate realistic DAO votes for this cycle
    generateDAOVotes();
    
    logger.info(`🚀 Enhanced KALE Weather Farming System Initialized`);
    logger.info(`📊 Cycle: ${currentCycle} | Block Duration: ${BLOCK_DURATION/1000}s | Total Blocks: ${TOTAL_BLOCKS}`);
    
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

async function setupDemoUsers() {
  const users = [
    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Alice', balance: 10000 },
    { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Bob', balance: 5000 },
    { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Charlie', balance: 7500 }
  ];

  for (const user of users) {
    // Create exactly 56-character Stellar-format addresses
    const userName = user.name.toUpperCase().substring(0, 5).padEnd(5, 'X');
    const mainWallet = `G${userName}${'1'.repeat(50)}`;
    const custodialWallet = `G${userName}${'2'.repeat(50)}`;
    
    await db.query(`
      INSERT INTO users (user_id, main_wallet_address, custodial_wallet_address) 
      VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING
    `, [user.id, mainWallet, custodialWallet]);

    await db.query(`
      INSERT INTO custodial_wallets (wallet_address, encrypted_private_key, user_id, current_balance)
      VALUES ($1, $2, $3, $4) ON CONFLICT (wallet_address) DO NOTHING
    `, [custodialWallet, 'encrypted_key', user.id, user.balance * 10000000]);
  }
}

async function createDemoCycle() {
  await db.query(`
    INSERT INTO weather_cycles (cycle_id, start_block, current_block, current_state, created_at)
    VALUES ($1, 1, 0, 'planting', NOW()) ON CONFLICT (cycle_id) DO NOTHING
  `, [currentCycle]);
}

function generateDAOVotes() {
  // Generate realistic DAO predictions with varying confidence
  const predictions = Math.random() > 0.6 ? 'GOOD' : 'BAD';
  
  daoVotes = {
    bull: { 
      prediction: Math.random() > 0.3 ? 'GOOD' : 'BAD', 
      confidence: 0.6 + Math.random() * 0.3, 
      revealed: false 
    },
    bear: { 
      prediction: Math.random() > 0.7 ? 'GOOD' : 'BAD', 
      confidence: 0.5 + Math.random() * 0.4, 
      revealed: false 
    },
    technical: { 
      prediction: predictions, 
      confidence: 0.7 + Math.random() * 0.2, 
      revealed: false 
    },
    sentiment: { 
      prediction: Math.random() > 0.5 ? 'GOOD' : 'BAD', 
      confidence: 0.4 + Math.random() * 0.4, 
      revealed: false 
    }
  };
}

function startBlockProgression() {
  logger.info(`🎬 STARTING CYCLE ${currentCycle} - Get ready for 10 blocks of intense weather farming!`);
  
  blockTimer = setInterval(async () => {
    currentBlock++;
    
    const blockStartTime = new Date().toLocaleTimeString();
    logger.info(`\n🚨 BLOCK ${currentBlock} STARTED at ${blockStartTime}`);
    logger.info(`${'='.repeat(60)}`);
    
    await updateCycleInDB();
    await handleBlockEvents();
    await notifyAllUsers();
    
    if (currentBlock >= TOTAL_BLOCKS) {
      await handleCycleCompletion();
      clearInterval(blockTimer);
    }
    
  }, BLOCK_DURATION);
}

async function updateCycleInDB() {
  await db.query(`UPDATE weather_cycles SET current_block = $1 WHERE cycle_id = $2`, [currentBlock, currentCycle]);
}

async function handleBlockEvents() {
  if (currentBlock === 2) {
    // Reveal ALL DAO votes at once
    daoVotes.bull.revealed = true;
    daoVotes.bear.revealed = true;
    daoVotes.technical.revealed = true;
    daoVotes.sentiment.revealed = true;
    
    logger.info(`🗳️  ALL DAO VOTES REVEALED (Block ${currentBlock}):`);
    logger.info(`   🐂 Bull DAO: ${daoVotes.bull.prediction} (${(daoVotes.bull.confidence * 100).toFixed(1)}% confidence)`);
    logger.info(`   🐻 Bear DAO: ${daoVotes.bear.prediction} (${(daoVotes.bear.confidence * 100).toFixed(1)}% confidence)`);
    logger.info(`   📊 Technical DAO: ${daoVotes.technical.prediction} (${(daoVotes.technical.confidence * 100).toFixed(1)}% confidence)`);
    logger.info(`   💭 Sentiment DAO: ${daoVotes.sentiment.prediction} (${(daoVotes.sentiment.confidence * 100).toFixed(1)}% confidence)`);
  }
  
  if (currentBlock === 6) {
    // Reveal location for agriculture
    selectedLocation = locationSelector.selectRandomLocation();
    cycleState = 'working';
    logger.info(`🌍 LOCATION REVEALED (Block ${currentBlock}):`);
    logger.info(`   📍 Selected Agriculture Location: ${selectedLocation.name}, ${selectedLocation.country}`);
    logger.info(`   ⚠️  From this block onwards: AGRICULTURE ONLY (no more wagers allowed)`);
  }
  
  if (currentBlock === 10) {
    await handleWeatherReveal();
  }
}

async function handleLocationReveal() {
  try {
    selectedLocation = await locationSelector.selectLocationForCycle(Number(currentCycle));
    cycleState = 'working';
    
    await db.query(`
      UPDATE weather_cycles 
      SET revealed_location_id = $1, revealed_location_name = $2, revealed_location_coordinates = $3,
          location_revealed_at = NOW(), current_state = 'working'
      WHERE cycle_id = $4
    `, [selectedLocation.id, selectedLocation.name, JSON.stringify(selectedLocation.coordinates), currentCycle]);
    
    logger.info(`🌍 LOCATION REVEALED: ${selectedLocation.name}, ${selectedLocation.country}`);
    logger.info(`📍 Coordinates: ${selectedLocation.coordinates.lat}, ${selectedLocation.coordinates.lon}`);
    logger.info(`⚠️  WAGER PHASE ENDED - Only agriculture (plant/store) allowed from now on!`);
    
  } catch (error) {
    logger.error('Location reveal failed:', error);
  }
}

async function handleWeatherReveal() {
  try {
    cycleState = 'completed';
    
    logger.info(`\n🌤️  COMPREHENSIVE WEATHER CALCULATION SYSTEM`);
    logger.info(`${'═'.repeat(80)}`);
    
    let realWeatherData: any = null;
    let realWeatherScore = 0;
    
    // 1. REAL WEATHER DATA COMPONENT
    if (selectedLocation) {
      logger.info(`📊 COMPONENT 1: REAL WEATHER DATA (Weight: 40%)`);
      logger.info(`   Location: ${selectedLocation.name}, ${selectedLocation.country}`);
      logger.info(`   Coordinates: ${selectedLocation.coordinates.lat}, ${selectedLocation.coordinates.lon}`);
      
      const weatherResult = await weatherService.fetchWeatherForLocation(selectedLocation);
      if (weatherResult.success && weatherResult.weather) {
        realWeatherData = weatherResult.weather.data;
        realWeatherScore = weatherResult.weather.score;
        
        logger.info(`   Temperature: ${realWeatherData.temperature}°C`);
        logger.info(`   Humidity: ${realWeatherData.humidity}%`);
        logger.info(`   Conditions: ${realWeatherData.conditions}`);
        logger.info(`   Wind Speed: ${realWeatherData.windSpeed} km/h`);
        logger.info(`   Precipitation: ${realWeatherData.precipitation}mm`);
        logger.info(`   ✅ Raw Weather Score: ${realWeatherScore}/100 (${realWeatherScore > 65 ? 'FAVORABLE' : 'UNFAVORABLE'} for kale farming)`);
      } else {
        logger.info(`   ❌ Weather API failed, using fallback data`);
        realWeatherScore = 50 + Math.random() * 40; // 50-90 range
      }
    }
    
    // 2. DAO CONSENSUS COMPONENT
    logger.info(`\n📊 COMPONENT 2: DAO CONSENSUS (Weight: 35%)`);
    let daoScore = 0;
    let daoDetails: any[] = [];
    
    Object.entries(daoVotes).forEach(([dao, vote]) => {
      const weight = dao === 'bull' ? 0.3 : dao === 'bear' ? 0.25 : dao === 'technical' ? 0.25 : 0.2;
      const contribution = (vote.prediction === 'GOOD' ? 1 : -1) * vote.confidence * weight;
      daoScore += contribution;
      
      daoDetails.push({
        dao: dao.toUpperCase(),
        prediction: vote.prediction,
        confidence: (vote.confidence * 100).toFixed(1) + '%',
        weight: (weight * 100).toFixed(0) + '%',
        contribution: contribution.toFixed(3)
      });
      
      logger.info(`   ${dao.toUpperCase()} DAO: ${vote.prediction} (${(vote.confidence * 100).toFixed(1)}% confidence, ${(weight * 100).toFixed(0)}% weight) → ${contribution.toFixed(3)}`);
    });
    
    // Normalize DAO score to 0-100
    const normalizedDAOScore = Math.max(0, Math.min(100, (daoScore + 1) * 50));
    logger.info(`   ✅ DAO Consensus Score: ${normalizedDAOScore.toFixed(1)}/100 (${normalizedDAOScore > 50 ? 'BULLISH' : 'BEARISH'} sentiment)`);
    
    // 3. COMMUNITY INFLUENCE COMPONENT
    logger.info(`\n📊 COMPONENT 3: COMMUNITY INFLUENCE (Weight: 25%)`);
    
    const wagerActions = userActions.filter(a => a.actionType === 'wager');
    const plantActions = userActions.filter(a => a.actionType === 'plant');
    const storeActions = userActions.filter(a => a.actionType === 'store');
    
    const totalGoodWagers = wagerActions.filter(a => a.actionData.direction === 'good')
                                      .reduce((sum, a) => sum + a.actionData.amount, 0);
    const totalBadWagers = wagerActions.filter(a => a.actionData.direction === 'bad')
                                     .reduce((sum, a) => sum + a.actionData.amount, 0);
    const totalPlanted = plantActions.reduce((sum, a) => sum + a.actionData.amount, 0);
    const totalStored = storeActions.reduce((sum, a) => sum + a.actionData.amount, 0);
    
    logger.info(`   💰 Wager Sentiment:`);
    logger.info(`      - GOOD weather wagers: ${totalGoodWagers.toLocaleString()} KALE`);
    logger.info(`      - BAD weather wagers: ${totalBadWagers.toLocaleString()} KALE`);
    logger.info(`      - Wager ratio: ${totalGoodWagers > totalBadWagers ? 'BULLISH' : 'BEARISH'} (${((totalGoodWagers / (totalGoodWagers + totalBadWagers)) * 100).toFixed(1)}% good)`);
    
    logger.info(`   🌱 Agriculture Sentiment:`);
    logger.info(`      - Total PLANTED: ${totalPlanted.toLocaleString()} KALE (optimistic)`);
    logger.info(`      - Total STORED: ${totalStored.toLocaleString()} KALE (pessimistic)`);
    logger.info(`      - Agriculture ratio: ${totalPlanted > totalStored ? 'OPTIMISTIC' : 'PESSIMISTIC'} (${((totalPlanted / (totalPlanted + totalStored)) * 100).toFixed(1)}% planted)`);
    
    // Calculate community influence score
    const wagerInfluence = totalGoodWagers > totalBadWagers ? 
                          (totalGoodWagers / (totalGoodWagers + totalBadWagers)) * 100 :
                          ((totalBadWagers / (totalGoodWagers + totalBadWagers)) - 1) * -100;
    const agricultureInfluence = totalPlanted > totalStored ?
                               (totalPlanted / (totalPlanted + totalStored)) * 100 :
                               ((totalStored / (totalPlanted + totalStored)) - 1) * -100;
    
    const communityScore = Math.max(0, Math.min(100, (wagerInfluence + agricultureInfluence) / 2 + 50));
    logger.info(`   ✅ Community Influence Score: ${communityScore.toFixed(1)}/100 (${communityScore > 50 ? 'OPTIMISTIC' : 'PESSIMISTIC'} community behavior)`);
    
    // 4. FINAL WEIGHTED CALCULATION
    logger.info(`\n🧮 FINAL WEATHER CALCULATION:`);
    logger.info(`${'─'.repeat(80)}`);
    
    const realWeatherWeight = 0.40;
    const daoWeight = 0.35;
    const communityWeight = 0.25;
    
    const finalScore = (realWeatherScore * realWeatherWeight) + 
                      (normalizedDAOScore * daoWeight) + 
                      (communityScore * communityWeight);
    
    logger.info(`   Real Weather:        ${realWeatherScore.toFixed(1)} × ${(realWeatherWeight * 100).toFixed(0)}% = ${(realWeatherScore * realWeatherWeight).toFixed(1)}`);
    logger.info(`   DAO Consensus:       ${normalizedDAOScore.toFixed(1)} × ${(daoWeight * 100).toFixed(0)}% = ${(normalizedDAOScore * daoWeight).toFixed(1)}`);
    logger.info(`   Community Influence: ${communityScore.toFixed(1)} × ${(communityWeight * 100).toFixed(0)}% = ${(communityScore * communityWeight).toFixed(1)}`);
    logger.info(`   ${'─'.repeat(60)}`);
    logger.info(`   📊 FINAL COMPOSITE SCORE: ${finalScore.toFixed(1)}/100`);
    
    // Determine outcome with threshold
    const threshold = 55; // Slightly favorable threshold
    weatherOutcome = finalScore >= threshold ? 'GOOD' : 'BAD';
    
    logger.info(`\n🎯 WEATHER OUTCOME DETERMINATION:`);
    logger.info(`   Threshold: ${threshold}/100 (${threshold >= 50 ? 'Optimistic' : 'Pessimistic'} bias)`);
    logger.info(`   Final Score: ${finalScore.toFixed(1)}/100`);
    logger.info(`   Result: ${weatherOutcome} WEATHER ${finalScore >= threshold ? '✅' : '❌'}`);
    logger.info(`   Margin: ${finalScore >= threshold ? '+' : ''}${(finalScore - threshold).toFixed(1)} points`);
    
    // 5. IMPACT ANALYSIS
    logger.info(`\n💰 ECONOMIC IMPACT PREVIEW:`);
    const goodWagerPayout = totalGoodWagers * (weatherOutcome === 'GOOD' ? 1.8 : 0);
    const badWagerPayout = totalBadWagers * (weatherOutcome === 'BAD' ? 1.8 : 0);
    const plantReward = totalPlanted * (weatherOutcome === 'GOOD' ? 0.15 : -0.4);
    const storeResult = totalStored * (weatherOutcome === 'BAD' ? 0.08 : -0.03);
    
    logger.info(`   Wager Winners: ${weatherOutcome === 'GOOD' ? 'GOOD weather bettors' : 'BAD weather bettors'} → ${(goodWagerPayout + badWagerPayout).toLocaleString()} KALE paid out`);
    logger.info(`   Plant Impact: ${weatherOutcome === 'GOOD' ? 'BONUS' : 'LOSS'} → ${plantReward >= 0 ? '+' : ''}${plantReward.toFixed(0)} KALE`);
    logger.info(`   Store Impact: ${weatherOutcome === 'BAD' ? 'PROTECTION' : 'RENT'} → ${storeResult >= 0 ? '+' : ''}${storeResult.toFixed(0)} KALE`);
    
    logger.info(`\n${'═'.repeat(80)}`);
    logger.info(`🏆 FINAL WEATHER: ${weatherOutcome} - Calculated using multi-factor analysis!`);
    logger.info(`${'═'.repeat(80)}`);
    
    // Store in database
    if (realWeatherData) {
      await db.query(`
        UPDATE weather_cycles 
        SET current_weather_data = $1, final_weather_score = $2, weather_source = $3,
            weather_outcome = $4, current_state = 'completed', weather_resolved_at = NOW(),
            dao_consensus_data = $5, weather_confidence = $6
        WHERE cycle_id = $7
      `, [
        JSON.stringify({
          raw: realWeatherData,
          calculation: {
            realWeatherScore,
            normalizedDAOScore,
            communityScore,
            finalScore,
            threshold,
            outcome: weatherOutcome
          }
        }),
        finalScore,
        weatherResult?.weather?.source || 'Composite Calculation',
        weatherOutcome,
        JSON.stringify({ daoVotes, daoScore: normalizedDAOScore }),
        finalScore / 100,
        currentCycle
      ]);
    }
    
  } catch (error) {
    logger.error('Weather calculation failed:', error);
    weatherOutcome = Math.random() > 0.5 ? 'GOOD' : 'BAD';
    logger.info(`🌤️  FALLBACK WEATHER: ${weatherOutcome} WEATHER (calculation error)`);
  }
}

async function notifyAllUsers() {
  // In a real system, this would use WebSockets
  logger.info(`📢 Broadcasting Block ${currentBlock} update to all connected users`);
}

async function calculateFinalRewards() {
  if (!weatherOutcome) return [];
  
  const results = [];
  
  // Calculate wager pool rewards
  const wagerActions = userActions.filter(a => a.actionType === 'wager');
  const totalWagerPool = wagerActions.reduce((sum, a) => sum + a.actionData.amount, 0);
  const winningWagers = wagerActions.filter(a => 
    (a.actionData.direction === 'good' && weatherOutcome === 'GOOD') ||
    (a.actionData.direction === 'bad' && weatherOutcome === 'BAD')
  );
  
  // Calculate agriculture rewards
  const plantActions = userActions.filter(a => a.actionType === 'plant');
  const storeActions = userActions.filter(a => a.actionType === 'store');
  const totalPlanted = plantActions.reduce((sum, a) => sum + a.actionData.amount, 0);
  const totalStored = storeActions.reduce((sum, a) => sum + a.actionData.amount, 0);
  
  // Process each user's actions
  const userIds = [...new Set(userActions.map(a => a.userId))];
  
  for (const userId of userIds) {
    const userWagers = wagerActions.filter(a => a.userId === userId);
    const userPlants = plantActions.filter(a => a.userId === userId);
    const userStores = storeActions.filter(a => a.userId === userId);
    
    let totalReward = 0;
    let totalLoss = 0;
    const breakdown = [];
    
    // Wager rewards/losses
    for (const wager of userWagers) {
      const won = (wager.actionData.direction === 'good' && weatherOutcome === 'GOOD') ||
                  (wager.actionData.direction === 'bad' && weatherOutcome === 'BAD');
      
      if (won) {
        const payout = wager.actionData.amount * 1.8; // 80% profit
        totalReward += payout;
        breakdown.push({
          type: 'wager',
          action: `${wager.actionData.amount} KALE on ${wager.actionData.direction.toUpperCase()}`,
          result: 'WON',
          amount: payout,
          details: `Won ${payout} KALE (${((payout - wager.actionData.amount) / wager.actionData.amount * 100).toFixed(1)}% profit)`
        });
      } else {
        totalLoss += wager.actionData.amount;
        breakdown.push({
          type: 'wager',
          action: `${wager.actionData.amount} KALE on ${wager.actionData.direction.toUpperCase()}`,
          result: 'LOST',
          amount: -wager.actionData.amount,
          details: `Lost ${wager.actionData.amount} KALE stake`
        });
      }
    }
    
    // Plant rewards/losses
    for (const plant of userPlants) {
      if (weatherOutcome === 'GOOD') {
        const baseReward = plant.actionData.amount * 0.15; // 15% base growth
        const poolBonus = totalWagerPool * 0.1 * (plant.actionData.amount / totalPlanted); // Share of wager pool
        const totalPlantReward = baseReward + poolBonus;
        totalReward += totalPlantReward;
        breakdown.push({
          type: 'plant',
          action: `Planted ${plant.actionData.amount} KALE`,
          result: 'GOOD WEATHER BONUS',
          amount: totalPlantReward,
          details: `Base: ${baseReward.toFixed(1)} + Pool bonus: ${poolBonus.toFixed(1)} KALE`
        });
      } else {
        const loss = plant.actionData.amount * 0.4; // 40% crop loss
        totalLoss += loss;
        breakdown.push({
          type: 'plant',
          action: `Planted ${plant.actionData.amount} KALE`,
          result: 'BAD WEATHER LOSS',
          amount: -loss,
          details: `Lost ${loss} KALE (40% crop failure)`
        });
      }
    }
    
    // Store rewards/costs
    for (const store of userStores) {
      if (weatherOutcome === 'BAD') {
        const protectionBonus = store.actionData.amount * 0.08; // 8% protection bonus
        totalReward += protectionBonus;
        breakdown.push({
          type: 'store',
          action: `Stored ${store.actionData.amount} KALE`,
          result: 'PROTECTION BONUS',
          amount: protectionBonus,
          details: `Earned ${protectionBonus} KALE protection bonus (8%)`
        });
      } else {
        const storageCost = store.actionData.amount * 0.03; // 3% storage cost
        totalLoss += storageCost;
        breakdown.push({
          type: 'store',
          action: `Stored ${store.actionData.amount} KALE`,
          result: 'STORAGE COST',
          amount: -storageCost,
          details: `Paid ${storageCost} KALE storage rent (3%)`
        });
      }
    }
    
    results.push({
      userId,
      totalReward,
      totalLoss,
      netResult: totalReward - totalLoss,
      breakdown
    });
  }
  
  return results;
}

// API Routes

app.get('/api/cycle/status', (req, res) => {
  res.json({
    cycleId: currentCycle.toString(),
    currentBlock,
    totalBlocks: TOTAL_BLOCKS,
    cycleState,
    selectedLocation,
    weatherOutcome,
    blockDuration: BLOCK_DURATION,
    phase: currentBlock <= 5 ? 'wager_and_agriculture' : currentBlock <= 9 ? 'agriculture_only' : 'settlement',
    daoVotes: Object.fromEntries(
      Object.entries(daoVotes).map(([key, vote]) => [
        key, 
        vote.revealed ? vote : { revealed: false }
      ])
    )
  });
});

app.post('/api/users/:userId/connect', (req, res) => {
  const { userId } = req.params;
  connectedUsers.add(userId);
  logger.info(`👤 User ${userId} connected to the game`);
  res.json({ connected: true, currentBlock, cycleState });
});

app.post('/api/users/:userId/actions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { actionType, actionData } = req.body;
    
    // Validate action timing
    if (currentBlock > 5 && actionType === 'wager') {
      return res.status(400).json({ error: 'Wagers not allowed after block 5 (location revealed)' });
    }
    
    if (currentBlock > 9) {
      return res.status(400).json({ error: 'No actions allowed during settlement phase' });
    }
    
    // Record action
    const action: UserAction = {
      userId,
      blockNumber: currentBlock,
      actionType: actionType as any,
      actionData,
      timestamp: new Date()
    };
    
    userActions.push(action);
    
    await db.query(`
      INSERT INTO cycle_actions (user_id, cycle_id, block_number, action_type, action_data)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, cycle_id, block_number) 
      DO UPDATE SET action_type = $4, action_data = $5
    `, [userId, currentCycle, currentBlock, actionType, JSON.stringify(actionData)]);
    
    logger.info(`📝 Block ${currentBlock}: User ${userId} - ${actionType.toUpperCase()}`, actionData);
    
    res.json({
      success: true,
      action,
      message: `${actionType.toUpperCase()} action recorded for block ${currentBlock}`
    });
    
  } catch (error) {
    logger.error('Action submission failed:', error);
    res.status(500).json({ error: 'Failed to submit action' });
  }
});

app.get('/api/cycle/results', async (req, res) => {
  if (currentBlock < TOTAL_BLOCKS) {
    return res.status(400).json({ error: 'Cycle not yet completed' });
  }
  
  const results = await calculateFinalRewards();
  
  res.json({
    cycleId: currentCycle.toString(),
    weatherOutcome,
    finalResults: results,
    totalActions: userActions.length,
    completedAt: new Date()
  });
});

app.get('/api/users/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query(`
      SELECT current_balance FROM custodial_wallets WHERE user_id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      balance: result.rows[0].current_balance / 10000000,
      balanceStroops: result.rows[0].current_balance
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

async function handleCycleCompletion() {
  const results = await calculateFinalRewards();
  
  logger.info(`\n🎉 CYCLE ${currentCycle} COMPLETED!`);
  logger.info(`${'='.repeat(80)}`);
  logger.info(`🌤️  Final Weather: ${weatherOutcome}`);
  logger.info(`📊 Total User Actions: ${userActions.length}`);
  logger.info(`💰 Total Connected Users: ${connectedUsers.size}`);
  
  for (const result of results) {
    logger.info(`\n👤 User ${result.userId}:`);
    logger.info(`   💰 Total Rewards: ${result.totalReward.toFixed(2)} KALE`);
    logger.info(`   💸 Total Losses: ${result.totalLoss.toFixed(2)} KALE`);
    logger.info(`   📈 Net Result: ${result.netResult >= 0 ? '+' : ''}${result.netResult.toFixed(2)} KALE`);
  }
  
  logger.info(`\n🏁 Demo completed! Server will remain active for result queries.`);
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    cycle: currentCycle.toString(),
    block: currentBlock,
    phase: cycleState,
    connectedUsers: connectedUsers.size
  });
});

async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    logger.info(`🚀 Enhanced KALE Weather Farming Backend Server running on port ${PORT}`);
    logger.info(`📡 API endpoints: http://localhost:${PORT}/api/`);
    logger.info(`⏰ Block progression: ${BLOCK_DURATION/1000} seconds per block`);
    logger.info(`🎮 Ready for enhanced demo with sophisticated game mechanics!`);
    logger.info(`\n⏳ Type 'start' and press Enter to begin the weather farming cycle...`);
    
    // Wait for user input to start the cycle
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        const input = chunk.toString().trim().toLowerCase();
        if (input === 'start') {
          logger.info(`🎬 STARTING CYCLE ${currentCycle} - Get ready for 10 blocks of intense weather farming!`);
          startCycle();
          process.stdin.pause();
        } else if (input === 'quit' || input === 'exit') {
          logger.info('\n🛑 Shutting down enhanced backend server...');
          if (blockTimer) clearInterval(blockTimer);
          process.exit(0);
        } else {
          logger.info(`❌ Unknown command: ${input}. Type 'start' to begin or 'quit' to exit.`);
        }
      }
    });
  });
}

process.on('SIGINT', () => {
  logger.info('\n🛑 Shutting down enhanced backend server...');
  if (blockTimer) clearInterval(blockTimer);
  process.exit(0);
});

startServer().catch((error) => {
  logger.error('Failed to start enhanced server:', error);
  process.exit(1);
});