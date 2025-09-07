import { type Request, type Response } from 'express';
import WagerService, { WagerDirection, type WagerPosition } from '../services/wagerService.js';
import logger from '../utils/logger.js';

class WagerApiController {
  private wagerService: WagerService;

  constructor() {
    this.wagerService = new WagerService();
  }

  /**
   * Place a weather wager for the current cycle
   * POST /api/wagers/place
   */
  async placeWager(req: Request, res: Response): Promise<void> {
    try {
      const { userId, direction, stakeAmount, cycleId } = req.body;

      // Validate request parameters
      if (!userId || !direction || !stakeAmount || !cycleId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, direction, stakeAmount, cycleId'
        });
        return;
      }

      if (!Object.values(WagerDirection).includes(direction as WagerDirection)) {
        res.status(400).json({
          success: false,
          error: 'Invalid wager direction. Must be "good" or "bad"'
        });
        return;
      }

      const stake = parseFloat(stakeAmount);
      if (isNaN(stake) || stake <= 0) {
        res.status(400).json({
          success: false,
          error: 'Stake amount must be a positive number'
        });
        return;
      }

      logger.info(`Wager placement request: ${JSON.stringify({ userId, direction, stake, cycleId })}`);

      const wager = await this.wagerService.placeWager(
        userId,
        BigInt(cycleId),
        direction as WagerDirection,
        stake
      );

      res.json({
        success: true,
        data: {
          wager,
          message: `${direction.toUpperCase()} weather wager placed successfully`
        }
      });

    } catch (error: any) {
      logger.error(`Failed to place wager: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get wager pool information for a cycle
   * GET /api/wagers/pool/:cycleId
   */
  async getWagerPool(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.params;

      if (!cycleId) {
        res.status(400).json({
          success: false,
          error: 'Cycle ID is required'
        });
        return;
      }

      logger.info(`Fetching wager pool for cycle ${cycleId}`);

      const pool = await this.wagerService.getWagerPool(BigInt(cycleId));

      res.json({
        success: true,
        data: pool
      });

    } catch (error: any) {
      logger.error(`Failed to fetch wager pool: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch wager pool information'
      });
    }
  }

  /**
   * Get all wagers for a specific cycle
   * GET /api/wagers/cycle/:cycleId
   */
  async getCycleWagers(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.params;

      if (!cycleId) {
        res.status(400).json({
          success: false,
          error: 'Cycle ID is required'
        });
        return;
      }

      logger.info(`Fetching wagers for cycle ${cycleId}`);

      const wagers = await this.wagerService.getCycleWagers(BigInt(cycleId));

      // Anonymize user IDs for privacy
      const anonymizedWagers = wagers.map(wager => ({
        ...wager,
        userId: wager.userId.substring(0, 8) + '...' // Show only first 8 chars
      }));

      res.json({
        success: true,
        data: {
          cycleId: BigInt(cycleId),
          wagerCount: wagers.length,
          wagers: anonymizedWagers
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch cycle wagers: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cycle wagers'
      });
    }
  }

  /**
   * Get user's wager history
   * GET /api/wagers/user/:userId/history
   */
  async getUserWagerHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      logger.info(`Fetching wager history for user ${userId}`);

      const history = await this.wagerService.getUserWagerHistory(userId, limit);

      res.json({
        success: true,
        data: {
          userId,
          wagerCount: history.length,
          history
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch user wager history: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch wager history'
      });
    }
  }

  /**
   * Get current cycle wager pool and bet influence
   * GET /api/wagers/current-pool
   */
  async getCurrentWagerPool(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching current cycle wager pool');

      // Get current active cycle
      const { db } = await import('../database/connection.js');
      const cycleResult = await db.query(`
        SELECT cycle_id FROM weather_cycles 
        WHERE current_state IN ('planting', 'working') 
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);

      if (cycleResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No active cycle found'
        });
        return;
      }

      const cycleId = BigInt(cycleResult.rows[0].cycle_id);
      const pool = await this.wagerService.getWagerPool(cycleId);
      const wagers = await this.wagerService.getCycleWagers(cycleId);

      // Calculate additional metrics
      const goodWagers = wagers.filter(w => w.direction === WagerDirection.BET_GOOD && w.status === 'active');
      const badWagers = wagers.filter(w => w.direction === WagerDirection.BET_BAD && w.status === 'active');

      res.json({
        success: true,
        data: {
          pool,
          metrics: {
            goodWagerCount: goodWagers.length,
            badWagerCount: badWagers.length,
            averageStake: pool.totalStakes > 0 ? pool.totalStakes / pool.participantCount : 0,
            poolImbalance: Math.abs(pool.totalGoodStakes - pool.totalBadStakes),
            majorityDirection: pool.dominantSide,
            influenceOnWeather: pool.betInfluence
          }
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch current wager pool: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch current wager pool'
      });
    }
  }

  /**
   * Get wager statistics across all cycles
   * GET /api/wagers/statistics
   */
  async getWagerStatistics(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Calculating wager system statistics');

      const stats = await this.wagerService.getWagerStatistics();

      // Calculate additional derived metrics
      const averagePayout = stats.totalWagers > 0 ? stats.totalPayouts / stats.totalWagers : 0;
      const totalProfit = stats.totalPayouts - stats.totalVolume;
      const houseEdge = stats.totalVolume > 0 ? (stats.totalVolume - stats.totalPayouts) / stats.totalVolume : 0;

      res.json({
        success: true,
        data: {
          ...stats,
          derivedMetrics: {
            averagePayout: Math.round(averagePayout * 100) / 100,
            totalProfitLoss: Math.round(totalProfit * 100) / 100,
            houseEdge: Math.round(houseEdge * 10000) / 100, // As percentage
            wageringActivity: stats.cyclesWithWagers > 0 ? stats.totalWagers / stats.cyclesWithWagers : 0,
            userEngagement: stats.uniqueWagerers > 0 ? stats.totalWagers / stats.uniqueWagerers : 0
          }
        }
      });

    } catch (error: any) {
      logger.error(`Failed to calculate wager statistics: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate wager statistics'
      });
    }
  }

  /**
   * Admin endpoint to manually process wager payouts
   * POST /api/wagers/admin/process-payouts
   */
  async processWagerPayouts(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId, weatherOutcome } = req.body;

      if (!cycleId || !weatherOutcome) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: cycleId, weatherOutcome'
        });
        return;
      }

      if (!['GOOD', 'BAD'].includes(weatherOutcome)) {
        res.status(400).json({
          success: false,
          error: 'Weather outcome must be "GOOD" or "BAD"'
        });
        return;
      }

      logger.info(`Processing wager payouts for cycle ${cycleId} with outcome ${weatherOutcome}`);

      const payouts = await this.wagerService.processWagerPayouts(
        BigInt(cycleId),
        weatherOutcome as 'GOOD' | 'BAD'
      );

      // Calculate summary statistics
      const totalPaidOut = payouts.reduce((sum, p) => sum + p.payout, 0);
      const winners = payouts.filter(p => p.payout > 0);
      const losers = payouts.filter(p => p.payout === 0);

      res.json({
        success: true,
        data: {
          cycleId: BigInt(cycleId),
          weatherOutcome,
          payoutSummary: {
            totalPayouts: payouts.length,
            winners: winners.length,
            losers: losers.length,
            totalPaidOut: Math.round(totalPaidOut * 100) / 100
          },
          payouts
        }
      });

    } catch (error: any) {
      logger.error(`Failed to process wager payouts: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Calculate bet influence for testing purposes
   * POST /api/wagers/calculate-influence
   */
  async calculateBetInfluence(req: Request, res: Response): Promise<void> {
    try {
      const { goodStakes, badStakes } = req.body;

      if (typeof goodStakes !== 'number' || typeof badStakes !== 'number') {
        res.status(400).json({
          success: false,
          error: 'goodStakes and badStakes must be numbers'
        });
        return;
      }

      if (goodStakes < 0 || badStakes < 0) {
        res.status(400).json({
          success: false,
          error: 'Stakes must be non-negative'
        });
        return;
      }

      const influence = this.wagerService.calculateBetInfluence(goodStakes, badStakes);

      res.json({
        success: true,
        data: influence
      });

    } catch (error: any) {
      logger.error(`Failed to calculate bet influence: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate bet influence'
      });
    }
  }
}

export default WagerApiController;