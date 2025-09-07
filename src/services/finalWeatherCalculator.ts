import { db } from '../database/connection.js';
import WagerService, { WagerInfluenceResult } from './wagerService.js';
import WeatherApiService from './weatherApiService.js';
import { DAOApiController } from '../api/dao-endpoints.js';
import logger from '../utils/logger.js';

export interface WeatherComponent {
  score: number;
  weight: number;
  confidence: number;
  source: string;
  data?: any;
}

export interface DAOWeatherConsensus {
  bullDAO: {
    prediction: 'GOOD' | 'BAD';
    confidence: number;
    weight: number;
    score: number;
  };
  bearDAO: {
    prediction: 'GOOD' | 'BAD';
    confidence: number;
    weight: number;
    score: number;
  };
  technicalDAO: {
    prediction: 'GOOD' | 'BAD';
    confidence: number;
    weight: number;
    score: number;
  };
  sentimentDAO: {
    prediction: 'GOOD' | 'BAD';
    confidence: number;
    weight: number;
    score: number;
  };
  weightedConsensusScore: number;
  overallConfidence: number;
}

export interface FinalWeatherCalculation {
  cycleId: bigint;
  components: {
    daoConsensus: WeatherComponent;
    realWeather: WeatherComponent;
    communityWagers: WeatherComponent;
  };
  finalScore: number;
  weatherOutcome: 'GOOD' | 'BAD';
  confidence: number;
  formula: {
    hasRealWeather: boolean;
    calculation: string;
    breakdown: string;
  };
  metadata: {
    location?: string;
    timestamp: Date;
    cyclePhase: string;
  };
}

class FinalWeatherCalculator {
  private wagerService: WagerService;
  private weatherApiService: WeatherApiService;
  private daoController: DAOApiController;

  // DAO Hidden Power Weights (configurable via environment)
  private readonly DAO_WEIGHTS = {
    bull: parseFloat(process.env.DAO_BULL_WEIGHT || '0.30'),
    bear: parseFloat(process.env.DAO_BEAR_WEIGHT || '0.25'),
    technical: parseFloat(process.env.DAO_TECHNICAL_WEIGHT || '0.25'),
    sentiment: parseFloat(process.env.DAO_SENTIMENT_WEIGHT || '0.20')
  };

  constructor() {
    this.wagerService = new WagerService();
    this.weatherApiService = new WeatherApiService();
    this.daoController = new DAOApiController(
      process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
      process.env.STELLAR_CONTRACT_ID || 'CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA'
    );

    logger.info(`FinalWeatherCalculator initialized with DAO weights: ${JSON.stringify(this.DAO_WEIGHTS)}`);
  }

  /**
   * Calculate final weather outcome by combining all three components
   */
  async calculateFinalWeather(cycleId: bigint): Promise<FinalWeatherCalculation> {
    logger.info(`Starting final weather calculation for cycle ${cycleId}`);

    try {
      // Get cycle data
      const cycleResult = await db.query(`
        SELECT 
          cycle_id, revealed_location_name, current_weather_data, weather_score, 
          weather_source, weather_fetch_error, current_state
        FROM weather_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }

      const cycle = cycleResult.rows[0];
      const hasRealWeather = cycle.current_weather_data && !cycle.weather_fetch_error;

      // 1. Get DAO Consensus Component
      const daoComponent = await this.calculateDAOConsensusComponent(cycleId);

      // 2. Get Real Weather Component (if available)  
      const realWeatherComponent = await this.calculateRealWeatherComponent(cycle, hasRealWeather);

      // 3. Get Community Wager Component
      const wagerComponent = await this.calculateWagerInfluenceComponent(cycleId);

      // 4. Apply Final Weather Formula
      const finalResult = this.applyFinalWeatherFormula(
        cycleId,
        daoComponent,
        realWeatherComponent,
        wagerComponent,
        hasRealWeather,
        cycle
      );

      // 5. Store calculation results
      await this.storeFinalWeatherCalculation(finalResult);

      logger.info(`Final weather calculated for cycle ${cycleId}: ${JSON.stringify({
        outcome: finalResult.weatherOutcome,
        score: finalResult.finalScore,
        confidence: finalResult.confidence,
        hasRealWeather: finalResult.formula.hasRealWeather
      })}`);

      return finalResult;

    } catch (error: any) {
      logger.error(`Failed to calculate final weather for cycle ${cycleId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate DAO consensus component with weighted voting
   */
  private async calculateDAOConsensusComponent(cycleId: bigint): Promise<WeatherComponent> {
    logger.info(`Calculating DAO consensus for cycle ${cycleId}`);

    try {
      // Get DAO predictions (this integrates with the actual DAO system)
      const daoVotes = await this.daoController.processWeatherVotes(cycleId.toString());
      
      // Simulate individual DAO predictions with different methodologies
      const daoConsensus: DAOWeatherConsensus = {
        bullDAO: {
          prediction: daoVotes.bullish_percentage > 50 ? 'GOOD' : 'BAD',
          confidence: Math.min(1.0, Math.abs(daoVotes.bullish_percentage - 50) / 50),
          weight: this.DAO_WEIGHTS.bull,
          score: daoVotes.bullish_percentage || 50
        },
        bearDAO: {
          prediction: daoVotes.bullish_percentage < 50 ? 'BAD' : 'GOOD', 
          confidence: Math.min(1.0, Math.abs(50 - daoVotes.bullish_percentage) / 50),
          weight: this.DAO_WEIGHTS.bear,
          score: 100 - (daoVotes.bullish_percentage || 50) // Inverse of bull
        },
        technicalDAO: {
          prediction: daoVotes.technical_score > 50 ? 'GOOD' : 'BAD',
          confidence: daoVotes.confidence || 0.7,
          weight: this.DAO_WEIGHTS.technical,
          score: daoVotes.technical_score || 50
        },
        sentimentDAO: {
          prediction: daoVotes.sentiment_score > 50 ? 'GOOD' : 'BAD',
          confidence: daoVotes.confidence || 0.7,
          weight: this.DAO_WEIGHTS.sentiment,
          score: daoVotes.sentiment_score || 50
        },
        weightedConsensusScore: 0,
        overallConfidence: 0
      };

      // Calculate weighted consensus score (0-100 scale)
      const weightedScore = 
        (daoConsensus.bullDAO.score * daoConsensus.bullDAO.weight) +
        (daoConsensus.bearDAO.score * daoConsensus.bearDAO.weight) +
        (daoConsensus.technicalDAO.score * daoConsensus.technicalDAO.weight) +
        (daoConsensus.sentimentDAO.score * daoConsensus.sentimentDAO.weight);

      // Calculate overall confidence (weighted average of individual confidences)
      const overallConfidence = 
        (daoConsensus.bullDAO.confidence * daoConsensus.bullDAO.weight) +
        (daoConsensus.bearDAO.confidence * daoConsensus.bearDAO.weight) +
        (daoConsensus.technicalDAO.confidence * daoConsensus.technicalDAO.weight) +
        (daoConsensus.sentimentDAO.confidence * daoConsensus.sentimentDAO.weight);

      daoConsensus.weightedConsensusScore = Math.round(weightedScore * 100) / 100;
      daoConsensus.overallConfidence = Math.round(overallConfidence * 10000) / 10000;

      logger.info(`DAO consensus calculated: ${JSON.stringify({
        weightedScore: daoConsensus.weightedConsensusScore,
        confidence: daoConsensus.overallConfidence,
        individual: {
          bull: daoConsensus.bullDAO.score,
          bear: daoConsensus.bearDAO.score,
          technical: daoConsensus.technicalDAO.score,
          sentiment: daoConsensus.sentimentDAO.score
        }
      })}`);

      return {
        score: daoConsensus.weightedConsensusScore,
        weight: 0, // Will be set by formula
        confidence: daoConsensus.overallConfidence,
        source: 'DAO Consensus',
        data: daoConsensus
      };

    } catch (error: any) {
      logger.warn(`Failed to get DAO consensus, using neutral default: ${error.message}`);
      
      // Return neutral consensus as fallback
      return {
        score: 50,
        weight: 0,
        confidence: 0.5,
        source: 'DAO Default',
        data: null
      };
    }
  }

  /**
   * Calculate real weather component from location weather data
   */
  private async calculateRealWeatherComponent(cycle: any, hasRealWeather: boolean): Promise<WeatherComponent> {
    if (!hasRealWeather) {
      logger.info('No real weather data available');
      return {
        score: 0,
        weight: 0,
        confidence: 0,
        source: 'No Real Weather Data',
        data: null
      };
    }

    try {
      const weatherData = cycle.current_weather_data;
      const weatherScore = parseFloat(cycle.weather_score) || 0;

      // Convert kale farming score (0-100) to weather outcome score
      // Higher farming score = better weather = higher outcome score
      const normalizedScore = Math.max(0, Math.min(100, weatherScore));

      logger.info(`Real weather component: ${JSON.stringify({
        location: cycle.revealed_location_name,
        farmingScore: weatherScore,
        normalizedScore: normalizedScore,
        source: cycle.weather_source,
        conditions: weatherData.conditions
      })}`);

      return {
        score: normalizedScore,
        weight: 0, // Will be set by formula
        confidence: 0.85, // Real weather data has high confidence
        source: cycle.weather_source || 'Weather API',
        data: {
          location: cycle.revealed_location_name,
          rawWeatherData: weatherData,
          farmingSuitability: weatherScore
        }
      };

    } catch (error: any) {
      logger.error(`Error processing real weather data: ${error.message}`);
      return {
        score: 0,
        weight: 0,
        confidence: 0,
        source: 'Real Weather Error',
        data: null
      };
    }
  }

  /**
   * Calculate community wager influence component
   */
  private async calculateWagerInfluenceComponent(cycleId: bigint): Promise<WeatherComponent> {
    try {
      const wagerPool = await this.wagerService.getWagerPool(cycleId);
      const betInfluence = wagerPool.betInfluence; // Range: -2.0 to +2.0

      // Convert bet influence to 0-100 score
      // -2.0 = 0 (strongly BAD), 0 = 50 (neutral), +2.0 = 100 (strongly GOOD)
      const normalizedScore = Math.round(((betInfluence + 2.0) / 4.0) * 100);

      // Calculate confidence based on wager participation
      const participationConfidence = Math.min(1.0, wagerPool.participantCount / 10); // Max confidence at 10+ participants
      const stakeConfidence = Math.min(1.0, wagerPool.totalStakes / 1000); // Max confidence at 1000+ KALE staked
      const overallConfidence = (participationConfidence + stakeConfidence) / 2;

      logger.info(`Community wager influence: ${JSON.stringify({
        betInfluence,
        normalizedScore,
        participants: wagerPool.participantCount,
        totalStakes: wagerPool.totalStakes,
        dominantSide: wagerPool.dominantSide,
        confidence: overallConfidence
      })}`);

      return {
        score: normalizedScore,
        weight: 0, // Will be set by formula
        confidence: overallConfidence,
        source: 'Community Wagers',
        data: {
          rawBetInfluence: betInfluence,
          participantCount: wagerPool.participantCount,
          totalStakes: wagerPool.totalStakes,
          dominantSide: wagerPool.dominantSide,
          goodStakes: wagerPool.totalGoodStakes,
          badStakes: wagerPool.totalBadStakes
        }
      };

    } catch (error: any) {
      logger.error(`Error calculating wager influence: ${error.message}`);
      return {
        score: 50, // Neutral when no wager data
        weight: 0,
        confidence: 0,
        source: 'Wager Error',
        data: null
      };
    }
  }

  /**
   * Apply the final weather formula combining all components
   */
  private applyFinalWeatherFormula(
    cycleId: bigint,
    daoComponent: WeatherComponent,
    realWeatherComponent: WeatherComponent,
    wagerComponent: WeatherComponent,
    hasRealWeather: boolean,
    cycle: any
  ): FinalWeatherCalculation {
    
    let finalScore: number;
    let formula: any;

    if (hasRealWeather) {
      // Formula: final = dao_consensus × 0.5 + real_weather × 0.3 + bet_influence × 0.2
      daoComponent.weight = 0.5;
      realWeatherComponent.weight = 0.3;
      wagerComponent.weight = 0.2;

      const daoContribution = daoComponent.score * daoComponent.weight;
      const weatherContribution = realWeatherComponent.score * realWeatherComponent.weight;
      const wagerContribution = wagerComponent.score * wagerComponent.weight;

      finalScore = daoContribution + weatherContribution + wagerContribution;

      formula = {
        hasRealWeather: true,
        calculation: `${daoComponent.score.toFixed(1)} × 0.5 + ${realWeatherComponent.score.toFixed(1)} × 0.3 + ${wagerComponent.score.toFixed(1)} × 0.2 = ${finalScore.toFixed(2)}`,
        breakdown: `DAO: ${daoContribution.toFixed(2)} + Weather: ${weatherContribution.toFixed(2)} + Wagers: ${wagerContribution.toFixed(2)}`
      };

    } else {
      // Formula: final = dao_consensus × 0.6 + bet_influence × 0.4
      daoComponent.weight = 0.6;
      wagerComponent.weight = 0.4;
      realWeatherComponent.weight = 0;

      const daoContribution = daoComponent.score * daoComponent.weight;
      const wagerContribution = wagerComponent.score * wagerComponent.weight;

      finalScore = daoContribution + wagerContribution;

      formula = {
        hasRealWeather: false,
        calculation: `${daoComponent.score.toFixed(1)} × 0.6 + ${wagerComponent.score.toFixed(1)} × 0.4 = ${finalScore.toFixed(2)}`,
        breakdown: `DAO: ${daoContribution.toFixed(2)} + Wagers: ${wagerContribution.toFixed(2)}`
      };
    }

    // Determine weather outcome (threshold: 50)
    const weatherOutcome: 'GOOD' | 'BAD' = finalScore > 50 ? 'GOOD' : 'BAD';

    // Calculate overall confidence (weighted by component contributions)
    const totalWeight = daoComponent.weight + realWeatherComponent.weight + wagerComponent.weight;
    const overallConfidence = (
      (daoComponent.confidence * daoComponent.weight) +
      (realWeatherComponent.confidence * realWeatherComponent.weight) +
      (wagerComponent.confidence * wagerComponent.weight)
    ) / totalWeight;

    return {
      cycleId,
      components: {
        daoConsensus: daoComponent,
        realWeather: realWeatherComponent,
        communityWagers: wagerComponent
      },
      finalScore: Math.round(finalScore * 100) / 100,
      weatherOutcome,
      confidence: Math.round(overallConfidence * 10000) / 10000,
      formula,
      metadata: {
        location: cycle.revealed_location_name,
        timestamp: new Date(),
        cyclePhase: cycle.current_state
      }
    };
  }

  /**
   * Store final weather calculation results in database
   */
  private async storeFinalWeatherCalculation(result: FinalWeatherCalculation): Promise<void> {
    await db.query(`
      UPDATE weather_cycles 
      SET 
        weather_outcome = $1,
        final_weather_score = $2,
        weather_confidence = $3,
        dao_consensus_data = $4,
        weather_resolved_at = NOW()
      WHERE cycle_id = $5
    `, [
      result.weatherOutcome,
      result.finalScore,
      result.confidence,
      JSON.stringify({
        components: {
          daoConsensus: result.components.daoConsensus,
          realWeather: result.components.realWeather,
          communityWagers: result.components.communityWagers
        },
        formula: result.formula,
        metadata: result.metadata
      }),
      result.cycleId
    ]);

    logger.info(`Final weather calculation stored for cycle ${result.cycleId}`);
  }

  /**
   * Get calculation history for analysis
   */
  async getCalculationHistory(limit: number = 10) {
    const result = await db.query(`
      SELECT 
        cycle_id, weather_outcome, final_weather_score, weather_confidence,
        dao_consensus_data, weather_resolved_at, revealed_location_name
      FROM weather_cycles 
      WHERE weather_outcome IS NOT NULL AND dao_consensus_data IS NOT NULL
      ORDER BY cycle_id DESC 
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      cycleId: row.cycle_id,
      outcome: row.weather_outcome,
      finalScore: row.final_weather_score,
      confidence: row.weather_confidence,
      location: row.revealed_location_name,
      resolvedAt: row.weather_resolved_at,
      calculationData: row.dao_consensus_data
    }));
  }
}

export default FinalWeatherCalculator;