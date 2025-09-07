// Cycle-Aware Block Monitor Service
// Manages 10-block weather cycles with phase-based operations

import { EventEmitter } from 'events';
import { Keypair } from '@stellar/stellar-sdk';
import { Client as KaleClient } from 'kale-sc-sdk';
import { db } from '../database/connection';
import { DAOApiController } from '../api/dao-endpoints';
import LocationSelector, { LocationSelectionResult } from './locationSelector.js';
import WeatherApiService, { WeatherApiResult } from './weatherApiService.js';
import logger from '../utils/logger.js';

export interface CycleInfo {
  cycleId: bigint;
  startBlock: bigint;
  endBlock: bigint;
  currentBlock: bigint;
  phase: CyclePhase;
  blocksRemaining: number;
  phaseProgress: number; // 0.0 to 1.0
}

export enum CyclePhase {
  PLANTING = 'planting',    // Blocks 0-5: Users can plant and place wagers
  WORKING = 'working',      // Blocks 6-8: Location revealed, agriculture only
  REVEALING = 'revealing',  // Block 9: DAO vote reveal & weather determination
  SETTLING = 'settling'     // Block 10+: Harvest & settlement
}

export interface CyclePhaseConfig {
  plantingBlocks: number;   // Default: 6 blocks (0-5)
  workingBlocks: number;    // Default: 3 blocks (6-8)
  revealingBlocks: number;  // Default: 1 block (9)
  settlingBlocks: number;   // Default: 1+ blocks (10+)
}

export class CycleBlockMonitor extends EventEmitter {
  private kaleClient: KaleClient;
  private daoController: DAOApiController;
  private locationSelector: LocationSelector;
  private weatherApiService: WeatherApiService;
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private currentBlock = 0n;
  private currentCycle: CycleInfo | null = null;
  
  // Configuration from environment
  private readonly CYCLE_LENGTH = parseInt(process.env.CYCLE_LENGTH || '10');
  private readonly CYCLE_START_BLOCK = BigInt(process.env.CYCLE_START_BLOCK || '0');
  private readonly MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || '5000'); // 5 seconds
  
  // Phase configuration
  private readonly phaseConfig: CyclePhaseConfig = {
    plantingBlocks: parseInt(process.env.PLANTING_BLOCKS || '6'),
    workingBlocks: parseInt(process.env.WORKING_BLOCKS || '3'), 
    revealingBlocks: parseInt(process.env.REVEALING_BLOCKS || '1'),
    settlingBlocks: parseInt(process.env.SETTLING_BLOCKS || '1')
  };

  constructor() {
    super();
    
    this.kaleClient = new KaleClient({
      rpcUrl: process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
      contractId: process.env.STELLAR_CONTRACT_ID || 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA',
      networkPassphrase: process.env.STELLAR_NETWORK === 'mainnet' 
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015'
    });

    this.daoController = new DAOApiController(
      process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
      process.env.STELLAR_CONTRACT_ID || 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA'
    );

    this.locationSelector = new LocationSelector();
    this.weatherApiService = new WeatherApiService();

    console.log('[CycleBlockMonitor] Initialized with cycle config:', {
      cycleLength: this.CYCLE_LENGTH,
      startBlock: this.CYCLE_START_BLOCK.toString(),
      phaseConfig: this.phaseConfig
    });
  }

  /**
   * Start cycle monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('[CycleBlockMonitor] Already running');
      return;
    }

    try {
      console.log('[CycleBlockMonitor] 🚀 Starting cycle monitoring...');

      // Get initial block and cycle
      await this.updateCurrentBlock();
      await this.updateCurrentCycle();

      // Start monitoring loop
      this.monitorInterval = setInterval(async () => {
        try {
          const previousBlock = this.currentBlock;
          await this.updateCurrentBlock();
          
          // Check for block change
          if (this.currentBlock !== previousBlock) {
            await this.handleBlockChange(previousBlock, this.currentBlock);
          }
        } catch (error) {
          console.error('[CycleBlockMonitor] Monitoring error:', error);
          this.emit('monitoringError', error);
        }
      }, this.MONITOR_INTERVAL);

      this.isRunning = true;
      console.log('[CycleBlockMonitor] ✅ Cycle monitoring started');
      
      // Emit initial state
      this.emit('monitoringStarted', this.currentCycle);

    } catch (error) {
      console.error('[CycleBlockMonitor] Failed to start monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop cycle monitoring
   */
  async stopMonitoring(): Promise<void> {
    console.log('[CycleBlockMonitor] 🛑 Stopping cycle monitoring...');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
    console.log('[CycleBlockMonitor] ✅ Cycle monitoring stopped');
    
    this.emit('monitoringStopped');
  }

  /**
   * Handle block changes and phase transitions
   */
  private async handleBlockChange(previousBlock: bigint, currentBlock: bigint): Promise<void> {
    console.log(`[CycleBlockMonitor] Block changed: ${previousBlock} -> ${currentBlock}`);
    
    const previousCycle = this.currentCycle;
    await this.updateCurrentCycle();
    
    // Check for cycle transition
    if (!previousCycle || previousCycle.cycleId !== this.currentCycle?.cycleId) {
      await this.handleCycleTransition(previousCycle, this.currentCycle);
    }
    
    // Check for phase transition within same cycle
    else if (previousCycle.phase !== this.currentCycle?.phase) {
      await this.handlePhaseTransition(previousCycle.phase, this.currentCycle.phase);
    }

    // Emit block change event
    this.emit('blockChanged', {
      previousBlock,
      currentBlock,
      cycle: this.currentCycle
    });
  }

  /**
   * Handle cycle transitions (new cycle started)
   */
  private async handleCycleTransition(previousCycle: CycleInfo | null, newCycle: CycleInfo | null): Promise<void> {
    if (previousCycle) {
      console.log(`[CycleBlockMonitor] 🔄 Cycle ${previousCycle.cycleId} ended`);
      
      // Finalize previous cycle
      await this.finalizeCycle(previousCycle.cycleId);
      
      this.emit('cycleEnded', previousCycle);
    }

    if (newCycle) {
      console.log(`[CycleBlockMonitor] 🌱 Cycle ${newCycle.cycleId} started - Phase: ${newCycle.phase}`);
      
      // Initialize new cycle
      await this.initializeCycle(newCycle);
      
      this.emit('cycleStarted', newCycle);
    }
  }

  /**
   * Handle phase transitions within a cycle
   */
  private async handlePhaseTransition(previousPhase: CyclePhase, newPhase: CyclePhase): Promise<void> {
    console.log(`[CycleBlockMonitor] 📍 Phase transition: ${previousPhase} -> ${newPhase}`);
    
    switch (newPhase) {
      case CyclePhase.PLANTING:
        await this.handlePlantingPhase();
        break;
      case CyclePhase.WORKING:
        await this.handleWorkingPhase();
        break;
      case CyclePhase.REVEALING:
        await this.handleRevealingPhase();
        break;
      case CyclePhase.SETTLING:
        await this.handleSettlingPhase();
        break;
    }

    this.emit('phaseChanged', {
      previousPhase,
      newPhase,
      cycle: this.currentCycle
    });
  }

  /**
   * Handle planting phase (blocks 0-5)
   */
  private async handlePlantingPhase(): Promise<void> {
    console.log('[CycleBlockMonitor] 🌱 Entering PLANTING phase');
    
    // Enable plant and wager request processing
    this.emit('plantingPhaseStarted', this.currentCycle);
    
    // Update cycle state in database
    if (this.currentCycle) {
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'planting'
        WHERE cycle_id = $1
      `, [this.currentCycle.cycleId]);
    }
  }

  /**
   * Handle working phase (blocks 6-8) - Location revealed at block 6
   */
  private async handleWorkingPhase(): Promise<void> {
    console.log('[CycleBlockMonitor] 🔨 Entering WORKING phase - Location will be revealed');
    
    // At block 6: Reveal real-world location
    await this.revealCycleLocation();
    
    // Stop new wager requests, allow only agriculture
    this.emit('workingPhaseStarted', this.currentCycle);
    
    if (this.currentCycle) {
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'working'
        WHERE cycle_id = $1
      `, [this.currentCycle.cycleId]);
    }
  }

  /**
   * Handle revealing phase (block 9) - DAO vote reveal
   */
  private async handleRevealingPhase(): Promise<void> {
    console.log('[CycleBlockMonitor] 🎭 Entering REVEALING phase - Revealing DAO votes');
    
    if (!this.currentCycle) return;

    try {
      // Reveal DAO votes for weather determination
      const daoResult = await this.daoController.calculateVotes({
        body: { blockIndex: Number(this.currentCycle.endBlock - 1n) }
      } as any, {} as any);

      if (daoResult && daoResult.consensusResult) {
        console.log(`[CycleBlockMonitor] 🌦️ Weather revealed: ${daoResult.consensusResult.finalWeather}`);
        
        // Store weather outcome
        await db.query(`
          UPDATE weather_cycles 
          SET current_state = 'revealing',
              weather_outcome = $1,
              weather_confidence = $2
          WHERE cycle_id = $3
        `, [
          daoResult.consensusResult.finalWeather,
          daoResult.analysis?.agreement || 0.5,
          this.currentCycle.cycleId
        ]);

        this.emit('weatherRevealed', {
          cycle: this.currentCycle,
          weather: daoResult.consensusResult.finalWeather,
          confidence: daoResult.analysis?.agreement || 0.5,
          consensusScore: daoResult.consensusResult.consensusScore
        });
      }

    } catch (error) {
      console.error('[CycleBlockMonitor] Failed to reveal weather:', error);
      this.emit('weatherRevealError', { cycle: this.currentCycle, error });
    }
  }

  /**
   * Handle settling phase (block 10+) - Harvest and settlement
   */
  private async handleSettlingPhase(): Promise<void> {
    console.log('[CycleBlockMonitor] 💰 Entering SETTLING phase');
    
    // Trigger harvest and settlement
    this.emit('settlingPhaseStarted', this.currentCycle);
    
    if (this.currentCycle) {
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'settling'
        WHERE cycle_id = $1
      `, [this.currentCycle.cycleId]);
    }
  }

  /**
   * Initialize new cycle in database
   */
  private async initializeCycle(cycle: CycleInfo): Promise<void> {
    try {
      await db.query(`
        INSERT INTO weather_cycles (
          cycle_id, start_block, end_block, current_state, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (cycle_id) DO NOTHING
      `, [cycle.cycleId, cycle.startBlock, cycle.endBlock, cycle.phase]);
      
      console.log(`[CycleBlockMonitor] ✅ Cycle ${cycle.cycleId} initialized in database`);
    } catch (error) {
      console.error('[CycleBlockMonitor] Failed to initialize cycle:', error);
    }
  }

  /**
   * Finalize completed cycle
   */
  private async finalizeCycle(cycleId: bigint): Promise<void> {
    try {
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'completed', completed_at = NOW()
        WHERE cycle_id = $1
      `, [cycleId]);
      
      console.log(`[CycleBlockMonitor] ✅ Cycle ${cycleId} finalized`);
    } catch (error) {
      console.error('[CycleBlockMonitor] Failed to finalize cycle:', error);
    }
  }

  /**
   * Reveal real-world location for current cycle (triggered at block 6)
   */
  private async revealCycleLocation(): Promise<void> {
    if (!this.currentCycle) {
      logger.error('Cannot reveal location: no current cycle');
      return;
    }

    try {
      logger.info(`Revealing location for cycle ${this.currentCycle.cycleId} at block ${this.currentBlock}`);

      // Generate block entropy from current block
      const blockEntropy = `${this.currentBlock}${Date.now()}`;
      
      // Select location using cryptographic randomness
      const locationResult = this.locationSelector.selectLocationForCycle(
        this.currentCycle.cycleId.toString(),
        blockEntropy
      );

      // Store location in database
      await db.query(`
        UPDATE weather_cycles 
        SET 
          revealed_location_id = $1,
          revealed_location_name = $2,
          revealed_location_coords = $3,
          location_selection_hash = $4,
          location_revealed_at = NOW()
        WHERE cycle_id = $5
      `, [
        locationResult.location.id,
        `${locationResult.location.name}, ${locationResult.location.country}`,
        JSON.stringify(locationResult.location.coordinates),
        locationResult.selectionHash,
        this.currentCycle.cycleId
      ]);

      logger.info(`Location revealed: ${JSON.stringify({
        cycleId: this.currentCycle.cycleId.toString(),
        location: locationResult.location.name,
        country: locationResult.location.country
      })}`);

      // Emit location revealed event
      this.emit('locationRevealed', {
        cycle: this.currentCycle,
        locationResult,
        block: this.currentBlock
      });

      // Fetch real-time weather for the selected location
      logger.info(`Fetching real-time weather for ${locationResult.location.name}...`);
      const weatherResult = await this.weatherApiService.fetchWeatherForLocation(locationResult.location);
      
      if (weatherResult.success && weatherResult.data && weatherResult.score) {
        // Store weather data in database
        await db.query(`
          UPDATE weather_cycles 
          SET 
            current_weather_data = $1,
            weather_score = $2,
            weather_source = $3,
            weather_fetched_at = NOW()
          WHERE cycle_id = $4
        `, [
          JSON.stringify(weatherResult.data),
          weatherResult.score.normalized,
          weatherResult.source,
          this.currentCycle.cycleId
        ]);

        const interpretation = this.weatherApiService.getWeatherInterpretation(weatherResult.score);
        
        logger.info(`Real-time weather for ${locationResult.location.name}: ${JSON.stringify({
          temperature: weatherResult.data.temperature,
          conditions: weatherResult.data.conditions,
          score: weatherResult.score.normalized,
          outlook: interpretation.farmingOutlook,
          source: weatherResult.source
        })}`);

        // Emit weather data event
        this.emit('weatherDataFetched', {
          cycle: this.currentCycle,
          location: locationResult.location,
          weather: weatherResult.data,
          score: weatherResult.score,
          interpretation,
          block: this.currentBlock
        });

      } else {
        logger.warn(`Failed to fetch weather for ${locationResult.location.name}: ${weatherResult.error}`);
        
        // Store failure in database
        await db.query(`
          UPDATE weather_cycles 
          SET 
            weather_fetch_error = $1,
            weather_fetched_at = NOW()
          WHERE cycle_id = $2
        `, [
          weatherResult.error || 'Unknown weather API error',
          this.currentCycle.cycleId
        ]);
      }

      // Get farming context for the location
      const farmingContext = this.locationSelector.getLocationFarmingContext(locationResult.location);
      
      logger.info(`Farming conditions for ${locationResult.location.name}: ${JSON.stringify({
        suitability: farmingContext.farmingSuitability,
        climateZone: farmingContext.climateZone,
        seasonalOptimal: farmingContext.seasonalFactors.isOptimalKaleGrowingSeason
      })}`);

    } catch (error: any) {
      logger.error(`Failed to reveal location for cycle ${this.currentCycle.cycleId}: ${error.message}`);
      this.emit('locationRevealError', { cycle: this.currentCycle, error });
    }
  }

  /**
   * Update current block from blockchain
   */
  private async updateCurrentBlock(): Promise<void> {
    try {
      const contractData = await this.kaleClient.get_index();
      this.currentBlock = BigInt(contractData.result);
    } catch (error) {
      console.error('[CycleBlockMonitor] Failed to get current block:', error);
    }
  }

  /**
   * Calculate and update current cycle info
   */
  private async updateCurrentCycle(): Promise<void> {
    const blocksSinceStart = this.currentBlock - this.CYCLE_START_BLOCK;
    const cycleId = blocksSinceStart / BigInt(this.CYCLE_LENGTH);
    const blockInCycle = Number(blocksSinceStart % BigInt(this.CYCLE_LENGTH));
    
    const startBlock = this.CYCLE_START_BLOCK + (cycleId * BigInt(this.CYCLE_LENGTH));
    const endBlock = startBlock + BigInt(this.CYCLE_LENGTH) - 1n;
    
    // Determine current phase
    let phase: CyclePhase;
    let phaseProgress: number;
    
    if (blockInCycle < this.phaseConfig.plantingBlocks) {
      phase = CyclePhase.PLANTING;
      phaseProgress = blockInCycle / this.phaseConfig.plantingBlocks;
    } else if (blockInCycle < this.phaseConfig.plantingBlocks + this.phaseConfig.workingBlocks) {
      phase = CyclePhase.WORKING;
      const workBlock = blockInCycle - this.phaseConfig.plantingBlocks;
      phaseProgress = workBlock / this.phaseConfig.workingBlocks;
    } else if (blockInCycle < this.phaseConfig.plantingBlocks + this.phaseConfig.workingBlocks + this.phaseConfig.revealingBlocks) {
      phase = CyclePhase.REVEALING;
      phaseProgress = 1.0; // Single block, always complete when in this phase
    } else {
      phase = CyclePhase.SETTLING;
      phaseProgress = 1.0; // Settlement can take multiple blocks
    }
    
    this.currentCycle = {
      cycleId,
      startBlock,
      endBlock,
      currentBlock: this.currentBlock,
      phase,
      blocksRemaining: Number(endBlock - this.currentBlock + 1n),
      phaseProgress
    };
  }

  /**
   * Get current cycle information
   */
  getCurrentCycle(): CycleInfo | null {
    return this.currentCycle;
  }

  /**
   * Check if cycle is in specific phase
   */
  isPhase(phase: CyclePhase): boolean {
    return this.currentCycle?.phase === phase;
  }

  /**
   * Check if planting is allowed
   */
  canPlant(): boolean {
    return this.isPhase(CyclePhase.PLANTING);
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    currentBlock: bigint;
    currentCycle: CycleInfo | null;
    config: {
      cycleLength: number;
      startBlock: bigint;
      phaseConfig: CyclePhaseConfig;
    };
  } {
    return {
      isRunning: this.isRunning,
      currentBlock: this.currentBlock,
      currentCycle: this.currentCycle,
      config: {
        cycleLength: this.CYCLE_LENGTH,
        startBlock: this.CYCLE_START_BLOCK,
        phaseConfig: this.phaseConfig
      }
    };
  }
}

export const cycleBlockMonitor = new CycleBlockMonitor();