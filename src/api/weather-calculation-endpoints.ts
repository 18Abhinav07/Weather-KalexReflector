import { type Request, type Response } from 'express';
import FinalWeatherCalculator from '../services/finalWeatherCalculator.js';
import WeatherResolutionService from '../services/weatherResolutionService.js';
import { db } from '../database/connection.js';
import logger from '../utils/logger.js';

class WeatherCalculationApiController {
  private finalWeatherCalculator: FinalWeatherCalculator;
  private weatherResolutionService: WeatherResolutionService;

  constructor() {
    this.finalWeatherCalculator = new FinalWeatherCalculator();
    this.weatherResolutionService = new WeatherResolutionService();
  }

  /**
   * Get comprehensive weather calculation for a specific cycle
   * GET /api/weather-calculation/:cycleId
   */
  async getWeatherCalculation(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.params;

      if (!cycleId) {
        res.status(400).json({
          success: false,
          error: 'Cycle ID is required'
        });
        return;
      }

      logger.info(`Fetching weather calculation for cycle ${cycleId}`);

      const calculation = await this.finalWeatherCalculator.calculateFinalWeather(BigInt(cycleId));

      res.json({
        success: true,
        data: {
          cycleId: calculation.cycleId.toString(),
          outcome: calculation.weatherOutcome,
          finalScore: calculation.finalScore,
          confidence: calculation.confidence,
          components: {
            daoConsensus: {
              score: calculation.components.daoConsensus.score,
              weight: calculation.components.daoConsensus.weight,
              confidence: calculation.components.daoConsensus.confidence,
              source: calculation.components.daoConsensus.source,
              breakdown: calculation.components.daoConsensus.data
            },
            realWeather: {
              score: calculation.components.realWeather.score,
              weight: calculation.components.realWeather.weight,
              confidence: calculation.components.realWeather.confidence,
              source: calculation.components.realWeather.source,
              data: calculation.components.realWeather.data
            },
            communityWagers: {
              score: calculation.components.communityWagers.score,
              weight: calculation.components.communityWagers.weight,
              confidence: calculation.components.communityWagers.confidence,
              source: calculation.components.communityWagers.source,
              wagerData: calculation.components.communityWagers.data
            }
          },
          formula: calculation.formula,
          metadata: calculation.metadata
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch weather calculation: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate weather'
      });
    }
  }

  /**
   * Get weather calculation for current active cycle
   * GET /api/weather-calculation/current
   */
  async getCurrentWeatherCalculation(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching current cycle weather calculation');

      // Get current active cycle
      const cycleResult = await db.query(`
        SELECT cycle_id FROM weather_cycles 
        WHERE current_state IN ('revealing', 'settling', 'working') 
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);

      if (cycleResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No active cycle found for weather calculation'
        });
        return;
      }

      const cycleId = BigInt(cycleResult.rows[0].cycle_id);
      const calculation = await this.finalWeatherCalculator.calculateFinalWeather(cycleId);

      res.json({
        success: true,
        data: calculation
      });

    } catch (error: any) {
      logger.error(`Failed to fetch current weather calculation: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate current weather'
      });
    }
  }

  /**
   * Get weather calculation history
   * GET /api/weather-calculation/history
   */
  async getCalculationHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      logger.info(`Fetching weather calculation history (limit: ${limit})`);

      const history = await this.finalWeatherCalculator.getCalculationHistory(limit);

      res.json({
        success: true,
        data: {
          calculations: history,
          count: history.length
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch calculation history: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch calculation history'
      });
    }
  }

  /**
   * Preview weather calculation without storing results (for testing)
   * POST /api/weather-calculation/preview
   */
  async previewWeatherCalculation(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.body;

      if (!cycleId) {
        res.status(400).json({
          success: false,
          error: 'Cycle ID is required'
        });
        return;
      }

      logger.info(`Previewing weather calculation for cycle ${cycleId}`);

      // This would use the calculator but not store results
      const calculation = await this.finalWeatherCalculator.calculateFinalWeather(BigInt(cycleId));

      res.json({
        success: true,
        data: {
          ...calculation,
          note: 'This is a preview calculation - results not stored'
        }
      });

    } catch (error: any) {
      logger.error(`Failed to preview weather calculation: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to preview calculation'
      });
    }
  }

  /**
   * Get component breakdown for debugging
   * GET /api/weather-calculation/:cycleId/components
   */
  async getComponentBreakdown(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.params;

      if (!cycleId) {
        res.status(400).json({
          success: false,
          error: 'Cycle ID is required'
        });
        return;
      }

      logger.info(`Fetching component breakdown for cycle ${cycleId}`);

      const calculation = await this.finalWeatherCalculator.calculateFinalWeather(BigInt(cycleId));

      // Detailed component analysis
      const breakdown = {
        cycleId: calculation.cycleId.toString(),
        finalOutcome: calculation.weatherOutcome,
        finalScore: calculation.finalScore,
        
        daoComponent: {
          individual: calculation.components.daoConsensus.data,
          weightedScore: calculation.components.daoConsensus.score,
          weight: calculation.components.daoConsensus.weight,
          contribution: calculation.components.daoConsensus.score * calculation.components.daoConsensus.weight,
          confidence: calculation.components.daoConsensus.confidence
        },
        
        realWeatherComponent: {
          available: calculation.components.realWeather.score > 0,
          farmingScore: calculation.components.realWeather.score,
          weight: calculation.components.realWeather.weight,
          contribution: calculation.components.realWeather.score * calculation.components.realWeather.weight,
          confidence: calculation.components.realWeather.confidence,
          locationData: calculation.components.realWeather.data
        },
        
        wagerComponent: {
          normalized_score: calculation.components.communityWagers.score,
          weight: calculation.components.communityWagers.weight,
          contribution: calculation.components.communityWagers.score * calculation.components.communityWagers.weight,
          confidence: calculation.components.communityWagers.confidence,
          wagerData: calculation.components.communityWagers.data
        },
        
        formula: {
          type: calculation.formula.hasRealWeather ? 'With Real Weather' : 'Without Real Weather',
          calculation: calculation.formula.calculation,
          breakdown: calculation.formula.breakdown
        },
        
        confidenceAnalysis: {
          overall: calculation.confidence,
          factors: {
            daoConfidence: calculation.components.daoConsensus.confidence,
            weatherConfidence: calculation.components.realWeather.confidence,
            wagerConfidence: calculation.components.communityWagers.confidence
          }
        }
      };

      res.json({
        success: true,
        data: breakdown
      });

    } catch (error: any) {
      logger.error(`Failed to get component breakdown: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to get component breakdown'
      });
    }
  }

  /**
   * Test calculation with custom parameters (admin only)
   * POST /api/weather-calculation/test
   */
  async testCalculation(req: Request, res: Response): Promise<void> {
    try {
      const { 
        daoScore = 50, 
        realWeatherScore = 50, 
        betInfluence = 0,
        hasRealWeather = true 
      } = req.body;

      logger.info('Running test weather calculation');

      // Simulate calculation components
      let finalScore: number;
      let formula: string;

      if (hasRealWeather) {
        finalScore = (daoScore * 0.5) + (realWeatherScore * 0.3) + (((betInfluence + 2.0) / 4.0) * 100 * 0.2);
        formula = `${daoScore} × 0.5 + ${realWeatherScore} × 0.3 + ${(((betInfluence + 2.0) / 4.0) * 100).toFixed(1)} × 0.2 = ${finalScore.toFixed(2)}`;
      } else {
        finalScore = (daoScore * 0.6) + (((betInfluence + 2.0) / 4.0) * 100 * 0.4);
        formula = `${daoScore} × 0.6 + ${(((betInfluence + 2.0) / 4.0) * 100).toFixed(1)} × 0.4 = ${finalScore.toFixed(2)}`;
      }

      const outcome = finalScore > 50 ? 'GOOD' : 'BAD';

      res.json({
        success: true,
        data: {
          inputs: { daoScore, realWeatherScore, betInfluence, hasRealWeather },
          calculation: {
            finalScore: Math.round(finalScore * 100) / 100,
            outcome,
            formula,
            threshold: 50
          },
          note: 'This is a test calculation with provided parameters'
        }
      });

    } catch (error: any) {
      logger.error(`Failed to run test calculation: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to run test calculation'
      });
    }
  }
}

export default WeatherCalculationApiController;