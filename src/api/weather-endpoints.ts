import { type Request, type Response } from 'express';
import { db } from '../database/connection.js';
import WeatherApiService from '../services/weatherApiService.js';
import LocationSelector from '../services/locationSelector.js';
import { convertLegacyScore } from '../types/weather.js';
import logger from '../utils/logger.js';

class WeatherApiController {
  private weatherService: WeatherApiService;
  private locationSelector: LocationSelector;

  constructor() {
    this.weatherService = new WeatherApiService();
    this.locationSelector = new LocationSelector();
  }

  /**
   * Get current weather for active cycle location
   */
  async getCurrentWeather(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching current cycle weather data');

      const result = await db.query(`
        SELECT 
          cycle_id,
          revealed_location_id,
          revealed_location_name,
          revealed_location_coords,
          current_weather_data,
          weather_score,
          weather_source,
          weather_fetched_at,
          weather_fetch_error,
          current_state
        FROM weather_cycles 
        WHERE current_state = 'active' 
        AND revealed_location_id IS NOT NULL
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No active cycle with revealed location found'
        });
        return;
      }

      const cycle = result.rows[0];
      
      let weatherInterpretation = null;
      if (cycle.current_weather_data && cycle.weather_score) {
        const score = {
          normalized: parseFloat(cycle.weather_score),
          temperature: 0, // These would be stored separately in a real implementation
          humidity: 0,
          windSpeed: 0,
          precipitation: 0,
          overall: parseFloat(cycle.weather_score)
        };
        weatherInterpretation = this.weatherService.getWeatherInterpretation(convertLegacyScore(score));
      }

      res.json({
        success: true,
        data: {
          cycleId: cycle.cycle_id,
          location: {
            id: cycle.revealed_location_id,
            name: cycle.revealed_location_name,
            coordinates: cycle.revealed_location_coords
          },
          weather: cycle.current_weather_data ? {
            data: cycle.current_weather_data,
            score: cycle.weather_score,
            source: cycle.weather_source,
            fetchedAt: cycle.weather_fetched_at,
            interpretation: weatherInterpretation
          } : null,
          error: cycle.weather_fetch_error
        }
      });

    } catch (error: any) {
      logger.error(`Failed to fetch current weather: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch weather data'
      });
    }
  }

  /**
   * Get weather history for completed cycles
   */
  async getWeatherHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      logger.info(`Fetching weather history (limit: ${limit})`);

      const result = await db.query(`
        SELECT 
          cycle_id,
          revealed_location_name,
          current_weather_data,
          weather_score,
          weather_source,
          weather_fetched_at,
          weather_outcome,
          completed_at
        FROM weather_cycles 
        WHERE current_state = 'completed' 
        AND revealed_location_id IS NOT NULL
        ORDER BY cycle_id DESC 
        LIMIT $1
      `, [limit]);

      const history = result.rows.map((cycle: any) => ({
        cycleId: cycle.cycle_id,
        location: cycle.revealed_location_name,
        weather: cycle.current_weather_data,
        score: cycle.weather_score,
        source: cycle.weather_source,
        fetchedAt: cycle.weather_fetched_at,
        outcome: cycle.weather_outcome,
        completedAt: cycle.completed_at
      }));

      res.json({
        success: true,
        data: history
      });

    } catch (error: any) {
      logger.error(`Failed to fetch weather history: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch weather history'
      });
    }
  }

  /**
   * Get weather statistics across all cycles
   */
  async getWeatherStatistics(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Calculating weather system statistics');

      const result = await db.query(`
        SELECT 
          COUNT(*) as total_cycles_settled,
          COUNT(CASE WHEN weather_outcome = 'GOOD' THEN 1 END) as good_weather_cycles,
          COUNT(CASE WHEN weather_outcome = 'BAD' THEN 1 END) as bad_weather_cycles,
          AVG(weather_confidence) as average_confidence,
          AVG(weather_score) as average_weather_score,
          COUNT(CASE WHEN weather_fetch_error IS NULL AND current_weather_data IS NOT NULL THEN 1 END) as successful_weather_fetches,
          COUNT(CASE WHEN weather_fetch_error IS NOT NULL THEN 1 END) as failed_weather_fetches,
          SUM(total_stake_amount) as total_rewards_distributed
        FROM weather_cycles 
        WHERE current_state = 'completed'
      `);

      const stats = result.rows[0];
      
      // Get API success rates
      const apiStats = await db.query(`
        SELECT 
          weather_source,
          COUNT(*) as usage_count
        FROM weather_cycles 
        WHERE current_weather_data IS NOT NULL
        GROUP BY weather_source
        ORDER BY usage_count DESC
      `);

      res.json({
        success: true,
        data: {
          totalCyclesSettled: parseInt(stats.total_cycles_settled) || 0,
          goodWeatherCycles: parseInt(stats.good_weather_cycles) || 0,
          badWeatherCycles: parseInt(stats.bad_weather_cycles) || 0,
          averageConfidence: parseFloat(stats.average_confidence) || 0,
          averageWeatherScore: parseFloat(stats.average_weather_score) || 0,
          successfulWeatherFetches: parseInt(stats.successful_weather_fetches) || 0,
          failedWeatherFetches: parseInt(stats.failed_weather_fetches) || 0,
          totalRewardsDistributed: parseInt(stats.total_rewards_distributed) || 0,
          apiUsageStats: apiStats.rows
        }
      });

    } catch (error: any) {
      logger.error(`Failed to calculate weather statistics: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate statistics'
      });
    }
  }

  /**
   * Test weather API connectivity
   */
  async testWeatherApis(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Testing weather API connectivity');
      
      const connectivity = await this.weatherService.testApiConnectivity();
      
      res.json({
        success: true,
        data: {
          apis: connectivity,
          summary: {
            total: Object.keys(connectivity).length,
            active: Object.values(connectivity).filter(Boolean).length,
            inactive: Object.values(connectivity).filter(status => !status).length
          }
        }
      });

    } catch (error: any) {
      logger.error(`Failed to test weather APIs: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to test API connectivity'
      });
    }
  }

  /**
   * Manually fetch weather for a specific location (admin endpoint)
   */
  async fetchWeatherForLocation(req: Request, res: Response): Promise<void> {
    try {
      const { locationId } = req.params;
      
      logger.info(`Manual weather fetch requested for location: ${locationId}`);
      
      const location = this.locationSelector.getLocationById(locationId);
      if (!location) {
        res.status(404).json({
          success: false,
          error: 'Location not found'
        });
        return;
      }

      const weatherResult = await this.weatherService.fetchWeatherForLocation(location);
      
      if (weatherResult.success && weatherResult.weather) {
        const interpretation = this.weatherService.getWeatherInterpretation(weatherResult.weather);
        
        res.json({
          success: true,
          data: {
            location,
            weather: weatherResult.weather.data,
            score: weatherResult.weather.score,
            interpretation,
            source: weatherResult.weather.source
          }
        });
      } else {
        res.status(503).json({
          success: false,
          error: weatherResult.error || 'Failed to fetch weather data'
        });
      }

    } catch (error: any) {
      logger.error(`Failed to fetch weather for location: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch weather data'
      });
    }
  }
}

export default WeatherApiController;