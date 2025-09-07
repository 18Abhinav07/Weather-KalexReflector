import { db } from '../database/connection.js';
import logger from '../utils/logger.js';
import {
  WagerDirection,
  type WagerPosition,
  type WagerPool,
  type WagerInfluenceResult,
  type WagerPayoutResult
} from '../types/wager.js';

export { WagerDirection } from '../types/wager.js';
export type {
  WagerPosition,
  WagerPool,
  WagerInfluenceResult,
  WagerPayoutResult
} from '../types/wager.js';

class WagerService {
  constructor() {
    logger.info('WagerService initialized for community betting system');
  }

  /**
   * Place a weather wager for a user in the current cycle
   * Only allowed during PLANTING phase (blocks 0-5)
   */
  async placeWager(
    userId: string,
    cycleId: bigint,
    direction: WagerDirection,
    stakeAmount: number
  ): Promise<WagerPosition> {
    logger.info(`User ${userId} placing ${direction} wager of ${stakeAmount} KALE for cycle ${cycleId}`);

    try {
      // Validate wager parameters
      if (stakeAmount <= 0) {
        throw new Error('Wager amount must be positive');
      }

      if (!Object.values(WagerDirection).includes(direction)) {
        throw new Error('Invalid wager direction');
      }

      // Check if cycle exists and is in planting phase
      const cycleResult = await db.query(`
        SELECT current_state, cycle_id 
        FROM weather_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      if (cycleResult.rows.length === 0) {
        throw new Error('Cycle not found');
      }

      const cycleState = cycleResult.rows[0].current_state;
      if (cycleState !== 'planting') {
        throw new Error(`Wagers can only be placed during planting phase. Current state: ${cycleState}`);
      }

      // Check if user already has a wager in this cycle
      const existingWager = await db.query(`
        SELECT wager_id FROM weather_wagers 
        WHERE user_id = $1 AND cycle_id = $2
      `, [userId, cycleId]);

      if (existingWager.rows.length > 0) {
        throw new Error('User already has an active wager in this cycle');
      }

      // Create wager position
      const wagerResult = await db.query(`
        INSERT INTO weather_wagers (
          user_id, cycle_id, wager_type, amount, placed_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING wager_id, placed_at
      `, [userId, cycleId, direction, stakeAmount]);

      const wager: WagerPosition = {
        wagerId: wagerResult.rows[0].wager_id,
        userId,
        cycleId,
        direction,
        stakeAmount,
        placedAt: wagerResult.rows[0].placed_at,
        status: 'active'
      };

      // Update user balance (deduct stake) - TODO: implement when wallet system ready
      // await db.query(`
      //   UPDATE custodial_wallets 
      //   SET current_balance = current_balance - $1
      //   WHERE user_id = $2 AND current_balance >= $3
      // `, [stakeAmount * 10000000, userId, stakeAmount * 10000000]);

      // Wager placed successfully
      logger.info(`Wager placed: ${direction} for ${stakeAmount} KALE in cycle ${cycleId}`);

      logger.info(`Wager placed successfully: ${JSON.stringify({
        wagerId: wager.wagerId,
        userId,
        direction,
        amount: stakeAmount
      })}`);

      return wager;

    } catch (error: any) {
      logger.error(`Failed to place wager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all wagers for a specific cycle
   */
  async getCycleWagers(cycleId: bigint): Promise<WagerPosition[]> {
    const result = await db.query(`
      SELECT 
        wager_id, user_id, cycle_id, wager_type, 
        amount, placed_at, payout_amount, is_winner
      FROM weather_wagers 
      WHERE cycle_id = $1
      ORDER BY placed_at DESC
    `, [cycleId]);

    return result.rows.map((row: any) => ({
      wagerId: row.wager_id,
      userId: row.user_id,
      cycleId: BigInt(row.cycle_id),
      direction: row.wager_type as WagerDirection,
      stakeAmount: row.amount,
      placedAt: row.placed_at,
      status: 'active' as const,
      finalPayout: row.payout_amount
    }));
  }

  /**
   * Get wager pool information for a cycle
   */
  async getWagerPool(cycleId: bigint): Promise<WagerPool> {
    const result = await db.query(`
      SELECT 
        COUNT(*) as participant_count,
        SUM(CASE WHEN wager_type = 'good' THEN amount ELSE 0 END) as total_good_stakes,
        SUM(CASE WHEN wager_type = 'bad' THEN amount ELSE 0 END) as total_bad_stakes,
        SUM(amount) as total_stakes
      FROM weather_wagers 
      WHERE cycle_id = $1
    `, [cycleId]);

    const poolData = result.rows[0];
    const goodStakes = parseFloat(poolData.total_good_stakes) || 0;
    const badStakes = parseFloat(poolData.total_bad_stakes) || 0;
    const totalStakes = goodStakes + badStakes;
    
    // Calculate bet influence using architecture formula
    const influenceResult = this.calculateBetInfluence(goodStakes, badStakes);

    return {
      cycleId,
      totalGoodStakes: goodStakes,
      totalBadStakes: badStakes,
      totalStakes,
      betInfluence: influenceResult.betInfluence,
      dominantSide: influenceResult.dominantSide,
      influenceStrength: influenceResult.influenceStrength,
      participantCount: parseInt(poolData.participant_count) || 0
    };
  }

  /**
   * Calculate bet influence based on architecture specifications
   * Formula from WeatherFlow.mmd lines 61-68
   */
  calculateBetInfluence(goodStakes: number, badStakes: number): WagerInfluenceResult {
    const totalStakes = goodStakes + badStakes;
    
    if (totalStakes === 0) {
      return {
        betInfluence: 0,
        totalStakes: 0,
        goodStakes: 0,
        badStakes: 0,
        dominantSide: null,
        stakeRatio: 0.5,
        influenceStrength: 0
      };
    }

    // Determine larger side and calculate ratios
    const largerSide = Math.max(goodStakes, badStakes);
    const stakeRatio = largerSide / totalStakes;
    
    // Calculate influence strength (range 0.5 to 2.0)
    // Formula: influence_strength = stake_ratio * 2.0 (clamped between 0.5-2.0)
    const influenceStrength = Math.max(0.5, Math.min(2.0, stakeRatio * 2.0));
    
    // Determine dominant side and apply direction
    let dominantSide: WagerDirection | null = null;
    let betInfluence = 0;
    
    if (goodStakes > badStakes) {
      dominantSide = WagerDirection.BET_GOOD;
      betInfluence = +influenceStrength; // Positive influence for good weather
    } else if (badStakes > goodStakes) {
      dominantSide = WagerDirection.BET_BAD;
      betInfluence = -influenceStrength; // Negative influence for bad weather
    }
    // If equal, influence remains 0

    logger.info(`Bet influence calculated: ${JSON.stringify({
      goodStakes,
      badStakes,
      totalStakes,
      stakeRatio: stakeRatio.toFixed(3),
      influenceStrength: influenceStrength.toFixed(3),
      betInfluence: betInfluence.toFixed(3),
      dominantSide
    })}`);

    return {
      betInfluence,
      totalStakes,
      goodStakes,
      badStakes,
      dominantSide,
      stakeRatio,
      influenceStrength
    };
  }

  /**
   * Process wager payouts after weather outcome is determined
   */
  async processWagerPayouts(cycleId: bigint, weatherOutcome: 'GOOD' | 'BAD'): Promise<WagerPayoutResult[]> {
    logger.info(`Processing wager payouts for cycle ${cycleId} with outcome: ${weatherOutcome}`);

    try {
      // Get all active wagers for this cycle
      const wagers = await this.getCycleWagers(cycleId);
      const activeWagers = wagers.filter(w => w.status === 'active');
      
      if (activeWagers.length === 0) {
        logger.info(`No active wagers found for cycle ${cycleId}`);
        return [];
      }

      // Separate winners and losers
      const winningDirection = weatherOutcome === 'GOOD' ? WagerDirection.BET_GOOD : WagerDirection.BET_BAD;
      const winners = activeWagers.filter(w => w.direction === winningDirection);
      const losers = activeWagers.filter(w => w.direction !== winningDirection);

      // Calculate total prize pool (all stakes)
      const totalPrizePool = activeWagers.reduce((sum, w) => sum + w.stakeAmount, 0);
      const totalWinningStakes = winners.reduce((sum, w) => sum + w.stakeAmount, 0);

      logger.info(`Wager payout calculation: ${JSON.stringify({
        totalWagers: activeWagers.length,
        winners: winners.length,
        losers: losers.length,
        totalPrizePool,
        totalWinningStakes
      })}`);

      const payoutResults: WagerPayoutResult[] = [];

      // Process payouts for winners (they share the total prize pool proportionally)
      for (const winner of winners) {
        const shareOfWinnings = totalWinningStakes > 0 ? winner.stakeAmount / totalWinningStakes : 0;
        const payout = shareOfWinnings * totalPrizePool;
        const profitLoss = payout - winner.stakeAmount;

        // Update database
        await db.query(`
          UPDATE weather_wagers 
          SET payout_amount = $1, is_winner = true
          WHERE wager_id = $2
        `, [payout, winner.wagerId]);

        // Credit user wallet
        await db.query(`
          UPDATE custodial_wallets 
          SET current_balance = current_balance + $1
          WHERE user_id = $2
        `, [Math.round(payout * 10000000), winner.userId]); // Convert to stroops

        payoutResults.push({
          wagerId: winner.wagerId,
          userId: winner.userId,
          originalStake: winner.stakeAmount,
          payout,
          profitLoss,
          payoutRatio: winner.stakeAmount > 0 ? payout / winner.stakeAmount : 0
        });

        logger.info(`Winner payout processed: ${JSON.stringify({
          userId: winner.userId,
          stake: winner.stakeAmount,
          payout: payout.toFixed(2),
          profit: profitLoss.toFixed(2)
        })}`);
      }

      // Process losers (they lose their stakes, no payout)
      for (const loser of losers) {
        await db.query(`
          UPDATE weather_wagers 
          SET payout_amount = 0, is_winner = false
          WHERE wager_id = $1
        `, [loser.wagerId]);

        payoutResults.push({
          wagerId: loser.wagerId,
          userId: loser.userId,
          originalStake: loser.stakeAmount,
          payout: 0,
          profitLoss: -loser.stakeAmount,
          payoutRatio: 0
        });

        logger.info(`Loser processed: ${JSON.stringify({
          userId: loser.userId,
          stake: loser.stakeAmount,
          loss: loser.stakeAmount
        })}`);
      }

      logger.info(`Wager payouts completed for cycle ${cycleId}: ${winners.length} winners, ${losers.length} losers`);
      return payoutResults;

    } catch (error: any) {
      logger.error(`Failed to process wager payouts for cycle ${cycleId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update wager pool totals for a cycle (internal method)
   */
  private async updateWagerPoolTotals(cycleId: bigint): Promise<void> {
    await db.query(`
      UPDATE weather_cycles 
      SET 
        total_participants = (
          SELECT COUNT(DISTINCT user_id) 
          FROM weather_wagers 
          WHERE cycle_id = $1
        ),
        total_stake_amount = (
          SELECT COALESCE(SUM(amount), 0) 
          FROM weather_wagers 
          WHERE cycle_id = $1
        )
      WHERE cycle_id = $1
    `, [cycleId]);
  }

  /**
   * Get user's wager history
   */
  async getUserWagerHistory(userId: string, limit: number = 10): Promise<WagerPosition[]> {
    const result = await db.query(`
      SELECT 
        w.wager_id, w.user_id, w.cycle_id, w.wager_type, 
        w.amount, w.placed_at, w.payout_amount
      FROM weather_wagers w
      WHERE w.user_id = $1
      ORDER BY w.placed_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows.map((row: any) => ({
      wagerId: row.wager_id,
      userId: row.user_id,
      cycleId: BigInt(row.cycle_id),
      direction: row.wager_type as WagerDirection,
      stakeAmount: row.amount,
      placedAt: row.placed_at,
      status: 'active' as const,
      finalPayout: row.payout_amount
    }));
  }

  /**
   * Get wager statistics across all cycles
   */
  async getWagerStatistics() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_wagers,
        COUNT(CASE WHEN payout_amount > amount THEN 1 END) as winning_wagers,
        COUNT(CASE WHEN payout_amount = 0 THEN 1 END) as losing_wagers,
        AVG(amount) as average_stake,
        SUM(amount) as total_volume,
        SUM(COALESCE(payout_amount, 0)) as total_payouts,
        COUNT(DISTINCT user_id) as unique_wagerers,
        COUNT(DISTINCT cycle_id) as cycles_with_wagers
      FROM weather_wagers
    `);

    const stats = result.rows[0];
    
    return {
      totalWagers: parseInt(stats.total_wagers) || 0,
      winningWagers: parseInt(stats.winning_wagers) || 0,
      losingWagers: parseInt(stats.losing_wagers) || 0,
      averageStake: parseFloat(stats.average_stake) || 0,
      totalVolume: parseFloat(stats.total_volume) || 0,
      totalPayouts: parseFloat(stats.total_payouts) || 0,
      uniqueWagerers: parseInt(stats.unique_wagerers) || 0,
      cyclesWithWagers: parseInt(stats.cycles_with_wagers) || 0,
      winRate: stats.total_wagers > 0 ? (parseInt(stats.winning_wagers) / parseInt(stats.total_wagers)) * 100 : 0
    };
  }
}

export default WagerService;