// Weather Integration Service - Implements SRS REQ-006
// Bridge between DAO Weather Oracle System and Farming Settlement

import { db } from '../database/connection';
import { DAOApiController } from '../api/dao-endpoints';
import { EventEmitter } from 'events';

export interface WeatherOutcome {
  cycleId: bigint;
  outcome: 'GOOD' | 'BAD';
  confidence: number; // 0.0 to 1.0
  consensusScore: number;
  daoVoteCount: number;
  timestamp: Date;
  blockIndex: bigint;
}

export interface WeatherModifier {
  cycleId: bigint;
  outcome: 'GOOD' | 'BAD';
  rewardMultiplier: number; // e.g., 1.5 for GOOD, 0.5 for BAD
  confidenceBonus: number; // Additional modifier based on confidence
  finalMultiplier: number; // Combined modifier applied to rewards
}

export interface CycleSettlement {
  cycleId: bigint;
  participantCount: number;
  totalStaked: bigint;
  weatherOutcome: 'GOOD' | 'BAD';
  averageReward: bigint;
  totalRewardsDistributed: bigint;
  settlementComplete: boolean;
}

export class WeatherIntegrationService extends EventEmitter {
  private daoController: DAOApiController;
  private readonly BASE_GOOD_MULTIPLIER = 1.5; // 50% bonus for GOOD weather
  private readonly BASE_BAD_MULTIPLIER = 0.5;  // 50% penalty for BAD weather
  private readonly CONFIDENCE_BONUS_MAX = 0.25; // Max 25% additional bonus/penalty

  constructor() {
    super();
    
    // Initialize DAO controller for weather predictions
    this.daoController = new DAOApiController(
      process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
      process.env.STELLAR_CONTRACT_ID || 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA'
    );

    console.log('[WeatherIntegrationService] Initialized with DAO weather oracle');
  }

  /**
   * Determine weather outcome for completed cycle per SRS REQ-006
   */
  async determineWeatherOutcome(cycleId: bigint): Promise<WeatherOutcome | null> {
    try {
      console.log(`[WeatherIntegrationService] Determining weather for cycle ${cycleId}`);

      // Get cycle information
      const cycleInfo = await this.getCycleInfo(cycleId);
      if (!cycleInfo) {
        throw new Error('Cycle not found');
      }

      // Use the end block of the cycle for weather determination
      const weatherBlock = cycleInfo.endBlock;

      // Get weather prediction from DAO oracle system
      const daoResponse = await this.daoController.calculateVotes({
        body: { blockIndex: Number(weatherBlock) }
      } as any, {} as any);

      if (typeof daoResponse !== 'object' || !daoResponse || !('consensusResult' in daoResponse)) {
        throw new Error('Failed to get DAO weather prediction');
      }

      const response = daoResponse as {
        consensusResult: { finalWeather: 'GOOD' | 'BAD'; consensusScore: number };
        analysis?: { agreement: number };
        voteCount?: number;
      };

      // Convert DAO response to weather outcome
      const outcome: WeatherOutcome = {
        cycleId,
        outcome: response.consensusResult.finalWeather,
        confidence: response.analysis?.agreement || 0.5,
        consensusScore: response.consensusResult.consensusScore,
        daoVoteCount: response.voteCount || 0,
        timestamp: new Date(),
        blockIndex: BigInt(weatherBlock)
      };

      // Store weather outcome in database
      await this.storeWeatherOutcome(outcome);

      console.log(`[WeatherIntegrationService] ✅ Weather determined: ${outcome.outcome} (${(outcome.confidence * 100).toFixed(1)}% confidence)`);

      // Emit weather outcome event
      this.emit('weatherOutcome', outcome);

      return outcome;

    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to determine weather outcome:', error);
      return null;
    }
  }

  /**
   * Calculate weather modifier for settlement per SRS requirements
   */
  calculateWeatherModifier(outcome: WeatherOutcome): WeatherModifier {
    let baseMultiplier: number;
    let confidenceBonus: number;

    // Determine base multiplier
    if (outcome.outcome === 'GOOD') {
      baseMultiplier = this.BASE_GOOD_MULTIPLIER;
      confidenceBonus = outcome.confidence * this.CONFIDENCE_BONUS_MAX; // Bonus for high confidence GOOD
    } else {
      baseMultiplier = this.BASE_BAD_MULTIPLIER;
      confidenceBonus = -(outcome.confidence * this.CONFIDENCE_BONUS_MAX); // Additional penalty for high confidence BAD
    }

    // Calculate final multiplier
    const finalMultiplier = Math.max(0.1, baseMultiplier + confidenceBonus); // Minimum 10% of original stake

    const modifier: WeatherModifier = {
      cycleId: outcome.cycleId,
      outcome: outcome.outcome,
      rewardMultiplier: baseMultiplier,
      confidenceBonus,
      finalMultiplier
    };

    console.log(`[WeatherIntegrationService] Weather modifier: ${finalMultiplier.toFixed(3)}x (${outcome.outcome})`);
    
    return modifier;
  }

  /**
   * Apply weather outcome to cycle settlement
   */
  async applyCycleSettlement(cycleId: bigint): Promise<CycleSettlement | null> {
    try {
      console.log(`[WeatherIntegrationService] Applying settlement for cycle ${cycleId}`);

      // Get weather outcome for cycle
      const weatherOutcome = await this.getWeatherOutcome(cycleId);
      if (!weatherOutcome) {
        // Determine weather if not already done
        const outcome = await this.determineWeatherOutcome(cycleId);
        if (!outcome) {
          throw new Error('Failed to determine weather outcome');
        }
      }

      // Calculate weather modifier
      const currentOutcome = weatherOutcome || await this.getWeatherOutcome(cycleId);
      if (!currentOutcome) {
        throw new Error('Weather outcome not available');
      }

      const modifier = this.calculateWeatherModifier(currentOutcome);

      // Apply settlement in database transaction
      const settlement = await db.transaction(async (client) => {
        // Get all farm positions for this cycle
        const positionsResult = await client.query(`
          SELECT position_id, user_id, stake_amount, base_reward
          FROM farm_positions
          WHERE cycle_id = $1 AND status = 'harvested'
        `, [cycleId]);

        const positions = positionsResult.rows;
        let totalRewardsDistributed = 0n;

        // Apply weather modifier to each position
        for (const position of positions) {
          const baseReward = BigInt(position.base_reward || position.stake_amount);
          const weatherAdjustedReward = BigInt(Math.floor(Number(baseReward) * modifier.finalMultiplier));
          
          // Update farm position with weather-adjusted reward
          await client.query(`
            UPDATE farm_positions
            SET final_reward = $1,
                weather_modifier = $2,
                status = 'settled'
            WHERE position_id = $3
          `, [weatherAdjustedReward, modifier.finalMultiplier, position.position_id]);

          // Update custodial wallet balance with final reward
          await client.query(`
            UPDATE custodial_wallets
            SET current_balance = current_balance + $1,
                last_transaction_at = NOW()
            WHERE user_id = $2
          `, [weatherAdjustedReward, position.user_id]);

          // Log settlement transaction
          await client.query(`
            INSERT INTO transaction_log (
              user_id, transaction_type, amount, wallet_address, 
              related_position_id, related_cycle_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            position.user_id,
            'settlement',
            weatherAdjustedReward,
            'system',
            position.position_id,
            cycleId,
            JSON.stringify({
              weatherOutcome: currentOutcome.outcome,
              weatherMultiplier: modifier.finalMultiplier,
              baseReward: baseReward.toString(),
              confidence: currentOutcome.confidence,
              settlementTimestamp: new Date().toISOString()
            })
          ]);

          totalRewardsDistributed += weatherAdjustedReward;
        }

        // Update weather cycle status
        await client.query(`
          UPDATE weather_cycles
          SET current_state = 'settled',
              weather_outcome = $1,
              weather_confidence = $2
          WHERE cycle_id = $3
        `, [currentOutcome.outcome, currentOutcome.confidence, cycleId]);

        // Calculate settlement summary
        const totalStaked = positions.reduce((sum: bigint, p: any) => sum + BigInt(p.stake_amount), 0n);
        const averageReward = positions.length > 0 ? totalRewardsDistributed / BigInt(positions.length) : 0n;

        return {
          cycleId,
          participantCount: positions.length,
          totalStaked,
          weatherOutcome: currentOutcome.outcome,
          averageReward,
          totalRewardsDistributed,
          settlementComplete: true
        };
      });

      console.log(`[WeatherIntegrationService] ✅ Settlement complete: ${settlement.participantCount} positions, ${settlement.totalRewardsDistributed.toString()} KALE distributed`);

      // Emit settlement complete event
      this.emit('settlementComplete', settlement);

      return settlement;

    } catch (error) {
      console.error('[WeatherIntegrationService] Settlement failed:', error);
      return null;
    }
  }

  /**
   * Get cycles ready for weather determination
   */
  async getCyclesReadyForWeather(currentBlock: bigint): Promise<bigint[]> {
    try {
      const result = await db.query(`
        SELECT cycle_id
        FROM weather_cycles
        WHERE current_state = 'completed' 
        AND end_block < $1
        AND weather_outcome IS NULL
        ORDER BY end_block ASC
      `, [currentBlock]);

      return result.rows.map((row: any) => BigInt(row.cycle_id));
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to get cycles ready for weather:', error);
      return [];
    }
  }

  /**
   * Automatically process weather outcomes for completed cycles
   */
  async processWeatherOutcomes(currentBlock: bigint): Promise<void> {
    try {
      const readyCycles = await this.getCyclesReadyForWeather(currentBlock);
      
      if (readyCycles.length === 0) {
        return;
      }

      console.log(`[WeatherIntegrationService] Processing weather for ${readyCycles.length} cycles`);

      for (const cycleId of readyCycles) {
        try {
          // Determine weather outcome
          const outcome = await this.determineWeatherOutcome(cycleId);
          if (outcome) {
            // Apply settlement
            await this.applyCycleSettlement(cycleId);
          }
        } catch (error) {
          console.error(`[WeatherIntegrationService] Failed to process cycle ${cycleId}:`, error);
        }
      }
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to process weather outcomes:', error);
    }
  }

  /**
   * Store weather outcome in database
   */
  private async storeWeatherOutcome(outcome: WeatherOutcome): Promise<void> {
    await db.query(`
      UPDATE weather_cycles
      SET weather_outcome = $1,
          weather_confidence = $2,
          current_state = 'completed'
      WHERE cycle_id = $3
    `, [outcome.outcome, outcome.confidence, outcome.cycleId]);
  }

  /**
   * Get stored weather outcome for cycle
   */
  async getWeatherOutcome(cycleId: bigint): Promise<WeatherOutcome | null> {
    try {
      const result = await db.query(`
        SELECT cycle_id, weather_outcome, weather_confidence, end_block, completed_at
        FROM weather_cycles
        WHERE cycle_id = $1 AND weather_outcome IS NOT NULL
      `, [cycleId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        cycleId: BigInt(row.cycle_id),
        outcome: row.weather_outcome,
        confidence: parseFloat(row.weather_confidence),
        consensusScore: 0, // Not stored in cycles table
        daoVoteCount: 0,   // Not stored in cycles table
        timestamp: row.completed_at || new Date(),
        blockIndex: BigInt(row.end_block)
      };
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to get weather outcome:', error);
      return null;
    }
  }

  /**
   * Get cycle information
   */
  private async getCycleInfo(cycleId: bigint): Promise<{ startBlock: bigint; endBlock: bigint; state: string } | null> {
    try {
      const result = await db.query(`
        SELECT start_block, end_block, current_state
        FROM weather_cycles
        WHERE cycle_id = $1
      `, [cycleId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        startBlock: BigInt(row.start_block),
        endBlock: BigInt(row.end_block),
        state: row.current_state
      };
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to get cycle info:', error);
      return null;
    }
  }

  /**
   * Get settlement history for analysis
   */
  async getSettlementHistory(limit: number = 50): Promise<CycleSettlement[]> {
    try {
      const result = await db.query(`
        SELECT wc.cycle_id, wc.total_participants, wc.total_stake_amount,
               wc.weather_outcome, wc.weather_confidence
        FROM weather_cycles wc
        WHERE wc.current_state = 'settled'
        ORDER BY wc.cycle_id DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map((row: any) => ({
        cycleId: BigInt(row.cycle_id),
        participantCount: parseInt(row.total_participants),
        totalStaked: BigInt(row.total_stake_amount || 0),
        weatherOutcome: row.weather_outcome,
        averageReward: 0n, // Would need to calculate from positions
        totalRewardsDistributed: 0n, // Would need to calculate from positions
        settlementComplete: true
      }));
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to get settlement history:', error);
      return [];
    }
  }

  /**
   * Get weather integration statistics
   */
  async getWeatherStatistics(): Promise<{
    totalCyclesSettled: number;
    goodWeatherCycles: number;
    badWeatherCycles: number;
    averageConfidence: number;
    totalRewardsDistributed: bigint;
  }> {
    try {
      const [totalResult, goodResult, badResult, confidenceResult, rewardsResult] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM weather_cycles WHERE current_state = \'settled\''),
        db.query('SELECT COUNT(*) as count FROM weather_cycles WHERE weather_outcome = \'GOOD\''),
        db.query('SELECT COUNT(*) as count FROM weather_cycles WHERE weather_outcome = \'BAD\''),
        db.query('SELECT AVG(weather_confidence) as avg_confidence FROM weather_cycles WHERE weather_confidence IS NOT NULL'),
        db.query('SELECT SUM(final_reward) as total FROM farm_positions WHERE status = \'settled\'')
      ]);

      return {
        totalCyclesSettled: parseInt(totalResult.rows[0].count),
        goodWeatherCycles: parseInt(goodResult.rows[0].count),
        badWeatherCycles: parseInt(badResult.rows[0].count),
        averageConfidence: parseFloat(confidenceResult.rows[0].avg_confidence || '0'),
        totalRewardsDistributed: BigInt(rewardsResult.rows[0].total || 0)
      };
    } catch (error) {
      console.error('[WeatherIntegrationService] Failed to get weather statistics:', error);
      return {
        totalCyclesSettled: 0,
        goodWeatherCycles: 0,
        badWeatherCycles: 0,
        averageConfidence: 0,
        totalRewardsDistributed: 0n
      };
    }
  }
}

export const weatherIntegrationService = new WeatherIntegrationService();