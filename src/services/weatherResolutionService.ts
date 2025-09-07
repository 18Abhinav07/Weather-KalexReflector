import { db } from '../database/connection.js';
import WagerService, { WagerInfluenceResult } from './wagerService.js';
import WeatherApiService, { WeatherScore } from './weatherApiService.js';
import FinalWeatherCalculator, { FinalWeatherCalculation } from './finalWeatherCalculator.js';
import { DAOApiController } from '../api/dao-endpoints.js';
import logger from '../utils/logger.js';

export interface DAOConsensus {
  bullVote: number;
  bearVote: number;
  technicalVote: number;
  sentimentVote: number;
  weightedScore: number;
  confidence: number;
}

export interface WeatherResolutionResult {
  cycleId: bigint;
  finalWeatherScore: number;
  weatherOutcome: 'GOOD' | 'BAD';
  components: {
    daoConsensus: DAOConsensus;
    realWeatherScore: number;
    betInfluence: number;
  };
  formula: {
    withRealWeather: boolean;
    daoWeight: number;
    weatherWeight: number;
    betWeight: number;
    calculation: string;
  };
  confidence: number;
}

class WeatherResolutionService {
  private wagerService: WagerService;
  private weatherApiService: WeatherApiService;
  private finalWeatherCalculator: FinalWeatherCalculator;
  private daoController: DAOApiController;

  constructor() {
    this.wagerService = new WagerService();
    this.weatherApiService = new WeatherApiService();
    this.finalWeatherCalculator = new FinalWeatherCalculator();
    this.daoController = new DAOApiController(
      process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
      process.env.STELLAR_CONTRACT_ID || 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA'
    );
    
    logger.info('WeatherResolutionService initialized with comprehensive weather calculator');
  }

  /**
   * Resolve final weather outcome using comprehensive calculation with all three components
   */
  async resolveWeatherForCycle(cycleId: bigint): Promise<WeatherResolutionResult> {
    logger.info(`Starting comprehensive weather resolution for cycle ${cycleId}`);

    try {
      // Use the new comprehensive final weather calculator
      const calculation = await this.finalWeatherCalculator.calculateFinalWeather(cycleId);

      // Convert to the expected format for backward compatibility
      const result: WeatherResolutionResult = {
        cycleId,
        finalWeatherScore: calculation.finalScore,
        weatherOutcome: calculation.weatherOutcome,
        components: {
          daoConsensus: {
            bullVote: calculation.components.daoConsensus.data?.bullDAO?.score || 50,
            bearVote: calculation.components.daoConsensus.data?.bearDAO?.score || 50,
            technicalVote: calculation.components.daoConsensus.data?.technicalDAO?.score || 50,
            sentimentVote: calculation.components.daoConsensus.data?.sentimentDAO?.score || 50,
            weightedScore: calculation.components.daoConsensus.score,
            confidence: calculation.components.daoConsensus.confidence
          },
          realWeatherScore: calculation.components.realWeather.score,
          betInfluence: calculation.components.communityWagers.data?.rawBetInfluence || 0
        },
        formula: {
          withRealWeather: calculation.formula.hasRealWeather,
          daoWeight: calculation.components.daoConsensus.weight,
          weatherWeight: calculation.components.realWeather.weight,
          betWeight: calculation.components.communityWagers.weight,
          calculation: calculation.formula.calculation
        },
        confidence: calculation.confidence
      };

      logger.info(`Comprehensive weather resolution completed for cycle ${cycleId}: ${JSON.stringify({
        outcome: result.weatherOutcome,
        score: result.finalWeatherScore,
        confidence: result.confidence,
        hasRealWeather: calculation.formula.hasRealWeather,
        location: calculation.metadata.location
      })}`);

      return result;

    } catch (error: any) {
      logger.error(`Failed to resolve weather for cycle ${cycleId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get DAO consensus with weighted voting
   */
  private async getDAOConsensus(cycleId: bigint): Promise<DAOConsensus> {
    try {
      logger.info(`Fetching DAO consensus for cycle ${cycleId}`);

      // Get DAO votes (this would integrate with actual DAO system)
      // For now, we'll simulate DAO consensus based on current market conditions
      const daoVotes = await this.daoController.processWeatherVotes(cycleId.toString());
      
      // Apply hidden power weights (these would be configurable)
      const weights = {
        bull: parseFloat(process.env.DAO_BULL_WEIGHT || '0.3'),
        bear: parseFloat(process.env.DAO_BEAR_WEIGHT || '0.25'), 
        technical: parseFloat(process.env.DAO_TECHNICAL_WEIGHT || '0.25'),
        sentiment: parseFloat(process.env.DAO_SENTIMENT_WEIGHT || '0.2')
      };

      const bullVote = daoVotes.bullish_percentage || 50;
      const bearVote = 100 - bullVote; // Bear is inverse of bull
      const technicalVote = daoVotes.technical_score || 50;
      const sentimentVote = daoVotes.sentiment_score || 50;

      // Calculate weighted score (0-100 scale)
      const weightedScore = 
        (bullVote * weights.bull) +
        (bearVote * weights.bear) +  
        (technicalVote * weights.technical) +
        (sentimentVote * weights.sentiment);

      const confidence = daoVotes.confidence || 0.7;

      const consensus: DAOConsensus = {
        bullVote,
        bearVote,
        technicalVote,
        sentimentVote,
        weightedScore: Math.round(weightedScore * 100) / 100,
        confidence
      };

      logger.info(`DAO consensus calculated: ${JSON.stringify(consensus)}`);
      return consensus;

    } catch (error: any) {
      logger.warn(`Failed to get DAO consensus, using default: ${error.message}`);
      
      // Return neutral consensus as fallback
      return {
        bullVote: 50,
        bearVote: 50,
        technicalVote: 50,
        sentimentVote: 50,
        weightedScore: 50,
        confidence: 0.5
      };
    }
  }

  /**
   * Calculate overall confidence in the weather prediction
   */
  private calculateOverallConfidence(daoConsensus: DAOConsensus, hasRealWeather: boolean): number {
    let confidence = daoConsensus.confidence;
    
    // Boost confidence if we have real weather data
    if (hasRealWeather) {
      confidence = Math.min(1.0, confidence * 1.2);
    }
    
    // Reduce confidence if DAO votes are very close to neutral
    const daoDeviation = Math.abs(daoConsensus.weightedScore - 50) / 50;
    confidence = confidence * (0.7 + 0.3 * daoDeviation);
    
    return Math.round(confidence * 10000) / 10000; // 4 decimal places
  }

  /**
   * Store weather resolution results in database
   */
  private async storeWeatherResolution(result: WeatherResolutionResult): Promise<void> {
    await db.query(`
      UPDATE weather_cycles 
      SET 
        weather_outcome = $1,
        weather_confidence = $2,
        final_weather_score = $3,
        dao_consensus_data = $4,
        weather_resolved_at = NOW()
      WHERE cycle_id = $5
    `, [
      result.weatherOutcome,
      result.confidence,
      result.finalWeatherScore,
      JSON.stringify({
        daoConsensus: result.components.daoConsensus,
        betInfluence: result.components.betInfluence,
        formula: result.formula
      }),
      result.cycleId
    ]);

    logger.info(`Weather resolution stored for cycle ${result.cycleId}`);
  }

  /**
   * Process complete cycle settlement including wager payouts
   */
  async settleCycle(cycleId: bigint): Promise<{
    weatherResolution: WeatherResolutionResult;
    wagerPayouts: any[];
    settlementSummary: any;
  }> {
    logger.info(`Starting complete settlement for cycle ${cycleId}`);

    try {
      // 1. Resolve weather outcome
      const weatherResolution = await this.resolveWeatherForCycle(cycleId);

      // 2. Process wager payouts based on weather outcome
      const wagerPayouts = await this.wagerService.processWagerPayouts(
        cycleId,
        weatherResolution.weatherOutcome
      );

      // 3. Calculate settlement summary
      const totalWagerVolume = wagerPayouts.reduce((sum, p) => sum + p.originalStake, 0);
      const totalPayouts = wagerPayouts.reduce((sum, p) => sum + p.payout, 0);
      const winners = wagerPayouts.filter(p => p.payout > 0);
      const losers = wagerPayouts.filter(p => p.payout === 0);

      const settlementSummary = {
        cycleId,
        weatherOutcome: weatherResolution.weatherOutcome,
        finalScore: weatherResolution.finalWeatherScore,
        totalWagers: wagerPayouts.length,
        winners: winners.length,
        losers: losers.length,
        totalVolume: totalWagerVolume,
        totalPayouts,
        netSystemProfit: totalWagerVolume - totalPayouts,
        averageWinnerPayout: winners.length > 0 ? totalPayouts / winners.length : 0
      };

      // 4. Update cycle status to completed
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'completed', completed_at = NOW()
        WHERE cycle_id = $1
      `, [cycleId]);

      logger.info(`Cycle ${cycleId} settlement completed: ${JSON.stringify({
        outcome: weatherResolution.weatherOutcome,
        wagers: settlementSummary.totalWagers,
        volume: settlementSummary.totalVolume
      })}`);

      return {
        weatherResolution,
        wagerPayouts,
        settlementSummary
      };

    } catch (error: any) {
      logger.error(`Failed to settle cycle ${cycleId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get weather resolution history
   */
  async getWeatherResolutionHistory(limit: number = 10) {
    const result = await db.query(`
      SELECT 
        cycle_id, weather_outcome, weather_confidence, final_weather_score,
        dao_consensus_data, weather_resolved_at, revealed_location_name,
        current_weather_data
      FROM weather_cycles 
      WHERE weather_outcome IS NOT NULL
      ORDER BY cycle_id DESC 
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      cycleId: row.cycle_id,
      outcome: row.weather_outcome,
      score: row.final_weather_score,
      confidence: row.weather_confidence,
      location: row.revealed_location_name,
      resolvedAt: row.weather_resolved_at,
      hasRealWeather: !!row.current_weather_data,
      consensusData: row.dao_consensus_data
    }));
  }
}

export default WeatherResolutionService;