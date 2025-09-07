import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import FinalWeatherCalculator, { 
  FinalWeatherCalculation, 
  WeatherComponent 
} from '../services/finalWeatherCalculator.js';
import { db } from '../database/connection.js';
import WeatherApiService from '../services/weatherApiService.js';
import WagerService from '../services/wagerService.js';

describe('FinalWeatherCalculator', () => {
  let calculator: FinalWeatherCalculator;
  const testCycleId = BigInt(888888);

  beforeEach(async () => {
    calculator = new FinalWeatherCalculator();

    // Clean up test data
    await db.query('DELETE FROM weather_cycles WHERE cycle_id = $1', [testCycleId]);
    await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);

    // Create test cycle with revealed location
    await db.query(`
      INSERT INTO weather_cycles (
        cycle_id, current_state, start_block, current_block,
        revealed_location_id, revealed_location_name, 
        revealed_location_coordinates, revealed_location_climate
      ) VALUES (
        $1, 'revealing', '1', '9',
        'london-uk', 'London', 
        '{"lat": 51.5074, "lon": -0.1278}', 'temperate'
      )
    `, [testCycleId]);
  });

  afterEach(async () => {
    // Cleanup
    await db.query('DELETE FROM weather_cycles WHERE cycle_id = $1', [testCycleId]);
    await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);
  });

  describe('Constructor', () => {
    it('should initialize with correct component weights', () => {
      expect(calculator).toBeDefined();
      expect(calculator['daoWeight']).toBe(0.5);
      expect(calculator['realWeatherWeight']).toBe(0.3);
      expect(calculator['wagerWeight']).toBe(0.2);
    });

    it('should initialize service dependencies', () => {
      expect(calculator['weatherApiService']).toBeDefined();
      expect(calculator['wagerService']).toBeDefined();
      expect(calculator['daoController']).toBeDefined();
    });
  });

  describe('calculateFinalWeather', () => {
    beforeEach(async () => {
      // Add sample wagers
      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES 
          ('user1', $1, 'good', 300, NOW()),
          ('user2', $1, 'bad', 200, NOW())
      `, [testCycleId]);

      // Mock external services
      spyOn(calculator['weatherApiService'], 'fetchWeatherForLocation').mockResolvedValue({
        success: true,
        weather: {
          data: {
            temperature: 16,
            humidity: 65,
            conditions: 'partly cloudy',
            windSpeed: 8,
            precipitation: 0
          },
          score: 85,
          factors: {
            temperature: 0.9,
            humidity: 0.8,
            wind: 0.85,
            precipitation: 1.0
          },
          source: 'OpenWeatherMap',
          interpretation: {
            farmingOutlook: 'excellent',
            weatherCategory: 'optimal'
          }
        }
      });

      spyOn(calculator['daoController'], 'processWeatherVotes').mockResolvedValue({
        bullish_percentage: 65,
        technical_score: 70,
        sentiment_score: 60,
        confidence: 0.8
      });
    });

    it('should calculate final weather with all three components', async () => {
      const result = await calculator.calculateFinalWeather(testCycleId);

      expect(result).toBeDefined();
      expect(result.cycleId).toBe(testCycleId);
      expect(result.weatherOutcome).toMatch(/^(GOOD|BAD)$/);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);

      // Check components
      expect(result.components.daoConsensus).toBeDefined();
      expect(result.components.realWeather).toBeDefined();
      expect(result.components.communityWagers).toBeDefined();

      // Check formula
      expect(result.formula.hasRealWeather).toBe(true);
      expect(result.formula.calculation).toContain('×');
      expect(result.formula.breakdown).toBeDefined();
    });

    it('should handle cycle without real weather data', async () => {
      // Mock weather API failure
      spyOn(calculator['weatherApiService'], 'fetchWeatherForLocation').mockResolvedValue({
        success: false,
        error: 'API unavailable'
      });

      const result = await calculator.calculateFinalWeather(testCycleId);

      expect(result.formula.hasRealWeather).toBe(false);
      expect(result.components.realWeather.score).toBe(0);
      expect(result.components.realWeather.confidence).toBe(0);
      
      // Should use dao×0.6 + wagers×0.4 formula
      expect(result.formula.calculation).toContain('0.6');
      expect(result.formula.calculation).toContain('0.4');
    });

    it('should handle cycle without wagers', async () => {
      // Clear wagers
      await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);

      const result = await calculator.calculateFinalWeather(testCycleId);

      expect(result.components.communityWagers.score).toBe(50); // Neutral
      expect(result.components.communityWagers.data?.totalStakes).toBe(0);
      expect(result.components.communityWagers.data?.betInfluence).toBe(0);
    });

    it('should calculate correct weather outcome based on score', async () => {
      // Mock high DAO score to ensure GOOD outcome
      spyOn(calculator['daoController'], 'processWeatherVotes').mockResolvedValue({
        bullish_percentage: 90,
        technical_score: 85,
        sentiment_score: 88,
        confidence: 0.9
      });

      const result = await calculator.calculateFinalWeather(testCycleId);

      expect(result.finalScore).toBeGreaterThan(50);
      expect(result.weatherOutcome).toBe('GOOD');
    });

    it('should calculate correct confidence levels', async () => {
      const result = await calculator.calculateFinalWeather(testCycleId);

      // Overall confidence should be combination of components
      expect(result.confidence).toBeGreaterThan(0.5); // With real weather and DAO data
      expect(result.components.daoConsensus.confidence).toBeDefined();
      expect(result.components.realWeather.confidence).toBeDefined();
      expect(result.components.communityWagers.confidence).toBeDefined();
    });

    it('should handle missing cycle data', async () => {
      const nonExistentCycle = BigInt(999999);
      
      await expect(calculator.calculateFinalWeather(nonExistentCycle)).rejects.toThrow();
    });
  });

  describe('DAO Component Calculation', () => {
    it('should calculate weighted DAO consensus correctly', async () => {
      spyOn(calculator['daoController'], 'processWeatherVotes').mockResolvedValue({
        bullish_percentage: 70,
        technical_score: 60,
        sentiment_score: 75,
        confidence: 0.85
      });

      const daoComponent = await calculator['calculateDAOComponent'](testCycleId);

      expect(daoComponent.score).toBeGreaterThanOrEqual(0);
      expect(daoComponent.score).toBeLessThanOrEqual(100);
      expect(daoComponent.weight).toBe(0.5);
      expect(daoComponent.confidence).toBe(0.85);
      expect(daoComponent.source).toBe('Stellar DAO Multi-Vote');
      
      // Check individual DAO scores
      expect(daoComponent.data?.bullDAO?.score).toBe(70);
      expect(daoComponent.data?.bearDAO?.score).toBe(30); // 100 - bullish
      expect(daoComponent.data?.technicalDAO?.score).toBe(60);
      expect(daoComponent.data?.sentimentDAO?.score).toBe(75);
    });

    it('should handle DAO API failures gracefully', async () => {
      spyOn(calculator['daoController'], 'processWeatherVotes').mockRejectedValue(
        new Error('DAO API failed')
      );

      const daoComponent = await calculator['calculateDAOComponent'](testCycleId);

      expect(daoComponent.score).toBe(50); // Neutral fallback
      expect(daoComponent.confidence).toBe(0.5);
      expect(daoComponent.source).toBe('Fallback (DAO unavailable)');
    });
  });

  describe('Real Weather Component Calculation', () => {
    it('should calculate weather score from API data', async () => {
      const mockWeatherResult = {
        success: true,
        weather: {
          data: {
            temperature: 18,
            humidity: 70,
            conditions: 'clear',
            windSpeed: 6,
            precipitation: 0
          },
          score: 92,
          factors: {
            temperature: 0.95,
            humidity: 0.9,
            wind: 0.8,
            precipitation: 1.0
          },
          source: 'WeatherAPI',
          interpretation: {
            farmingOutlook: 'excellent',
            weatherCategory: 'ideal'
          }
        }
      };

      spyOn(calculator['weatherApiService'], 'fetchWeatherForLocation')
        .mockResolvedValue(mockWeatherResult);

      const weatherComponent = await calculator['calculateRealWeatherComponent'](testCycleId);

      expect(weatherComponent.score).toBe(92);
      expect(weatherComponent.weight).toBe(0.3);
      expect(weatherComponent.confidence).toBeGreaterThan(0.8);
      expect(weatherComponent.source).toBe('WeatherAPI');
      expect(weatherComponent.data).toEqual(mockWeatherResult.weather.data);
    });

    it('should handle weather API failures', async () => {
      spyOn(calculator['weatherApiService'], 'fetchWeatherForLocation')
        .mockResolvedValue({
          success: false,
          error: 'All weather APIs failed'
        });

      const weatherComponent = await calculator['calculateRealWeatherComponent'](testCycleId);

      expect(weatherComponent.score).toBe(0);
      expect(weatherComponent.confidence).toBe(0);
      expect(weatherComponent.source).toBe('Unavailable');
    });

    it('should handle cycle without revealed location', async () => {
      // Update cycle to remove location
      await db.query(`
        UPDATE weather_cycles 
        SET revealed_location_id = NULL, revealed_location_name = NULL
        WHERE cycle_id = $1
      `, [testCycleId]);

      const weatherComponent = await calculator['calculateRealWeatherComponent'](testCycleId);

      expect(weatherComponent.score).toBe(0);
      expect(weatherComponent.source).toBe('No location revealed');
    });
  });

  describe('Community Wagers Component Calculation', () => {
    beforeEach(async () => {
      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES 
          ('user1', $1, 'good', 400, NOW()),
          ('user2', $1, 'good', 200, NOW()),
          ('user3', $1, 'bad', 150, NOW())
      `, [testCycleId]);
    });

    it('should calculate wager influence correctly', async () => {
      const wagerComponent = await calculator['calculateCommunityWagersComponent'](testCycleId);

      expect(wagerComponent.score).toBeGreaterThan(50); // Good wagers dominate
      expect(wagerComponent.weight).toBe(0.2);
      expect(wagerComponent.confidence).toBeGreaterThan(0);
      expect(wagerComponent.source).toBe('Community Wagers');
      
      // Check wager data
      expect(wagerComponent.data?.totalStakes).toBe(750);
      expect(wagerComponent.data?.totalGoodStakes).toBe(600);
      expect(wagerComponent.data?.totalBadStakes).toBe(150);
      expect(wagerComponent.data?.betInfluence).toBeGreaterThan(0);
    });

    it('should handle balanced wagers', async () => {
      // Clear and add balanced wagers
      await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);
      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES 
          ('user1', $1, 'good', 250, NOW()),
          ('user2', $1, 'bad', 250, NOW())
      `, [testCycleId]);

      const wagerComponent = await calculator['calculateCommunityWagersComponent'](testCycleId);

      expect(wagerComponent.score).toBeCloseTo(50, 1); // Neutral
      expect(wagerComponent.data?.betInfluence).toBeCloseTo(0, 1);
      expect(wagerComponent.data?.dominantSide).toBe('balanced');
    });
  });

  describe('Formula Calculations', () => {
    it('should use correct formula with real weather', () => {
      const daoScore = 70;
      const weatherScore = 85;
      const wagerScore = 60;
      const hasRealWeather = true;

      const result = calculator['calculateFinalScore'](
        daoScore, weatherScore, wagerScore, hasRealWeather
      );

      const expected = (daoScore * 0.5) + (weatherScore * 0.3) + (wagerScore * 0.2);
      expect(result.finalScore).toBeCloseTo(expected, 2);
      expect(result.formula).toContain('0.5');
      expect(result.formula).toContain('0.3');
      expect(result.formula).toContain('0.2');
    });

    it('should use correct formula without real weather', () => {
      const daoScore = 70;
      const wagerScore = 60;
      const hasRealWeather = false;

      const result = calculator['calculateFinalScore'](
        daoScore, 0, wagerScore, hasRealWeather
      );

      const expected = (daoScore * 0.6) + (wagerScore * 0.4);
      expect(result.finalScore).toBeCloseTo(expected, 2);
      expect(result.formula).toContain('0.6');
      expect(result.formula).toContain('0.4');
    });

    it('should handle edge case scores correctly', () => {
      // Test minimum scores
      const minResult = calculator['calculateFinalScore'](0, 0, 0, true);
      expect(minResult.finalScore).toBe(0);
      expect(minResult.outcome).toBe('BAD');

      // Test maximum scores
      const maxResult = calculator['calculateFinalScore'](100, 100, 100, true);
      expect(maxResult.finalScore).toBe(100);
      expect(maxResult.outcome).toBe('GOOD');

      // Test threshold boundary
      const thresholdResult = calculator['calculateFinalScore'](50, 50, 50, true);
      expect(thresholdResult.finalScore).toBe(50);
      expect(thresholdResult.outcome).toBe('BAD'); // 50 is not > 50
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate higher confidence with all components available', () => {
      const daoConfidence = 0.8;
      const weatherConfidence = 0.9;
      const wagerConfidence = 0.7;
      const hasRealWeather = true;

      const confidence = calculator['calculateOverallConfidence'](
        daoConfidence, weatherConfidence, wagerConfidence, hasRealWeather
      );

      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should calculate lower confidence without real weather', () => {
      const daoConfidence = 0.8;
      const wagerConfidence = 0.7;
      const hasRealWeather = false;

      const confidence = calculator['calculateOverallConfidence'](
        daoConfidence, 0, wagerConfidence, hasRealWeather
      );

      expect(confidence).toBeLessThan(0.8); // Should be lower without weather
    });

    it('should handle low component confidences', () => {
      const confidence = calculator['calculateOverallConfidence'](
        0.3, 0.2, 0.4, true
      );

      expect(confidence).toBeLessThan(0.5);
      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      spyOn(db, 'query').mockRejectedValue(new Error('Database connection failed'));

      await expect(calculator.calculateFinalWeather(testCycleId)).rejects.toThrow();
    });

    it('should handle service initialization failures', () => {
      // Test that calculator still initializes even with service issues
      const originalEnv = process.env.STELLAR_CONTRACT_ID;
      delete process.env.STELLAR_CONTRACT_ID;

      expect(() => new FinalWeatherCalculator()).not.toThrow();

      // Restore env
      if (originalEnv) process.env.STELLAR_CONTRACT_ID = originalEnv;
    });

    it('should validate input parameters', async () => {
      await expect(calculator.calculateFinalWeather(BigInt(-1))).rejects.toThrow();
    });
  });

  describe('Integration with Database', () => {
    it('should store calculation results correctly', async () => {
      const result = await calculator.calculateFinalWeather(testCycleId);

      // Check that cycle was updated
      const cycleCheck = await db.query(`
        SELECT weather_outcome, final_weather_score, weather_confidence
        FROM weather_cycles 
        WHERE cycle_id = $1
      `, [testCycleId]);

      expect(cycleCheck.rows).toHaveLength(1);
      expect(cycleCheck.rows[0].weather_outcome).toBe(result.weatherOutcome);
      expect(cycleCheck.rows[0].final_weather_score).toBeCloseTo(result.finalScore, 1);
      expect(cycleCheck.rows[0].weather_confidence).toBeCloseTo(result.confidence, 3);
    });
  });

  describe('Performance Tests', () => {
    it('should complete calculation within reasonable time', async () => {
      const start = performance.now();
      await calculator.calculateFinalWeather(testCycleId);
      const end = performance.now();

      expect(end - start).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should handle multiple concurrent calculations', async () => {
      // Create additional test cycles
      const cycles = [testCycleId + BigInt(1), testCycleId + BigInt(2), testCycleId + BigInt(3)];
      
      for (const cycleId of cycles) {
        await db.query(`
          INSERT INTO weather_cycles (
            cycle_id, current_state, start_block, current_block,
            revealed_location_id, revealed_location_name, 
            revealed_location_coordinates, revealed_location_climate
          ) VALUES (
            $1, 'revealing', '1', '9',
            'tokyo-jp', 'Tokyo', 
            '{"lat": 35.6762, "lon": 139.6503}', 'temperate'
          )
        `, [cycleId]);
      }

      try {
        const promises = cycles.map(cycleId => 
          calculator.calculateFinalWeather(cycleId)
        );

        const results = await Promise.all(promises);

        expect(results).toHaveLength(3);
        expect(results.every(r => r.weatherOutcome)).toBe(true);

      } finally {
        // Cleanup additional cycles
        for (const cycleId of cycles) {
          await db.query('DELETE FROM weather_cycles WHERE cycle_id = $1', [cycleId]);
        }
      }
    });
  });

  describe('getCalculationHistory', () => {
    beforeEach(async () => {
      // Create historical calculations
      const historicalCycles = [testCycleId + BigInt(10), testCycleId + BigInt(11)];
      
      for (const cycleId of historicalCycles) {
        await db.query(`
          INSERT INTO weather_cycles (
            cycle_id, current_state, weather_outcome, final_weather_score,
            weather_confidence, weather_resolved_at,
            revealed_location_name, current_weather_data
          ) VALUES (
            $1, 'completed', 'GOOD', 75.5, 0.85, NOW(),
            'London', '{"temperature": 18, "conditions": "clear"}'
          )
        `, [cycleId]);
      }
    });

    it('should return calculation history', async () => {
      const history = await calculator.getCalculationHistory(5);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0]).toHaveProperty('cycleId');
      expect(history[0]).toHaveProperty('weatherOutcome');
      expect(history[0]).toHaveProperty('finalScore');
      expect(history[0]).toHaveProperty('confidence');
    });

    it('should limit results correctly', async () => {
      const history = await calculator.getCalculationHistory(1);
      expect(history).toHaveLength(1);
    });
  });
});