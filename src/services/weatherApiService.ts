import axios, { type AxiosResponse } from 'axios';
import logger from '../utils/logger.js';
import type { Location } from './locationSelector.js';

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  conditions: string;
  source: string;
  timestamp: Date;
}

export interface WeatherScore {
  score: number;
  factors: {
    temperature: number;
    humidity: number;
    wind: number;
    precipitation: number;
  };
  interpretation?: {
    farmingOutlook: 'excellent' | 'good' | 'fair' | 'poor';
    weatherCategory?: string;
  };
}

export interface WeatherApiResult {
  success: boolean;
  weather?: {
    data: WeatherData;
    score: number;
    factors: {
      temperature: number;
      humidity: number;
      wind: number;
      precipitation: number;
    };
    source: string;
    interpretation?: {
      farmingOutlook: 'excellent' | 'good' | 'fair' | 'poor';
      weatherCategory?: string;
    };
  };
  error?: string;
}

interface KaleFarmingConditions {
  optimalTemp: { min: number; max: number };
  optimalHumidity: { min: number; max: number };
  optimalWind: { min: number; max: number };
  beneficialPrecipitation: { min: number; max: number };
}

class WeatherApiService {
  private readonly API_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RETRIES = 3;
  
  // Single weather API configuration (OpenWeatherMap only)  
  private readonly APIs = {
    openweather: {
      name: 'OpenWeatherMap',
      url: 'https://api.openweathermap.org/data/2.5/weather',
      key: process.env.OPENWEATHER_API_KEY,
      enabled: !!process.env.OPENWEATHER_API_KEY
    }
  };

  // Kale growing conditions (optimal for leafy greens)
  private readonly KALE_CONDITIONS: KaleFarmingConditions = {
    optimalTemp: { min: 18, max: 24 }, // 18-24°C ideal for kale
    optimalHumidity: { min: 60, max: 70 }, // 60-70% humidity
    optimalWind: { min: 5, max: 15 }, // 5-15 km/h light breeze
    beneficialPrecipitation: { min: 0.5, max: 5 } // Light rain beneficial
  };

  constructor() {
    const enabledAPIs = Object.values(this.APIs).filter(api => api.enabled).length;
    logger.info(`WeatherApiService initialized with ${enabledAPIs} active weather APIs`);
    
    if (enabledAPIs === 0) {
      logger.warn('No weather API keys configured - weather fetching will use fallback data');
    }
  }

  /**
   * Fetch real-time weather for a location with multiple API attempts
   */
  async fetchWeatherForLocation(location: Location): Promise<WeatherApiResult> {
    logger.info(`Fetching weather data for ${location.name}, ${location.country}`);

    // Try each API in sequence until one succeeds
    const apiAttempts = [
      () => this.fetchFromOpenWeather(location)
    ];

    for (let i = 0; i < apiAttempts.length; i++) {
      const attempt = apiAttempts[i];
      
      try {
        logger.info(`Weather API attempt ${i + 1}/3 for ${location.name}`);
        const result = await attempt();
        
        if (result.success && result.weather) {
          logger.info(`Weather data obtained from ${result.weather.source}: ${JSON.stringify({
            location: location.name,
            temperature: result.weather.data.temperature,
            conditions: result.weather.data.conditions
          })}`);
          
          // Calculate kale farming score
          const score = this.calculateKaleFarmingScore(result.weather.data);
          
          return {
            success: true,
            weather: {
              data: result.weather.data,
              score: score.score,
              factors: score.factors,
              source: result.weather.source,
              interpretation: score.interpretation
            }
          };
        }
        
      } catch (error: any) {
        logger.warn(`Weather API ${i + 1} failed for ${location.name}: ${error.message}`);
      }

      // Wait before next attempt
      if (i < apiAttempts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.error(`All weather APIs failed for ${location.name}`);
    return {
      success: false,
      error: 'All weather APIs failed'
    };
  }

  /**
   * Fetch from OpenWeatherMap API
   */
  private async fetchFromOpenWeather(location: Location): Promise<WeatherApiResult> {
    const api = this.APIs.openweather;
    if (!api.enabled) {
      throw new Error('OpenWeatherMap API key not configured');
    }

    const url = `${api.url}?lat=${location.coordinates.lat}&lon=${location.coordinates.lon}&appid=${api.key}&units=metric`;
    
    const response: AxiosResponse = await axios.get(url, {
      timeout: this.API_TIMEOUT
    });

    const data = response.data;
    const weatherData: WeatherData = {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      windSpeed: data.wind?.speed * 3.6 || 0, // Convert m/s to km/h
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      conditions: data.weather[0].description,
      source: api.name,
      timestamp: new Date()
    };

    return {
      success: true,
      weather: {
        data: weatherData,
        score: 0, // Will be calculated later
        factors: { temperature: 0, humidity: 0, wind: 0, precipitation: 0 },
        source: api.name
      }
    };
  }


  /**
   * Calculate kale farming suitability score based on weather conditions
   */
  public calculateKaleFarmingScore(weather: WeatherData): WeatherScore {
    const conditions = this.KALE_CONDITIONS;
    
    // Score each component (0-100)
    const tempScore = this.scoreInRange(
      weather.temperature,
      conditions.optimalTemp.min,
      conditions.optimalTemp.max,
      5 // Temperature tolerance
    );
    
    const humidityScore = this.scoreInRange(
      weather.humidity,
      conditions.optimalHumidity.min,
      conditions.optimalHumidity.max,
      10 // Humidity tolerance
    );
    
    const windScore = this.scoreInRange(
      weather.windSpeed,
      conditions.optimalWind.min,
      conditions.optimalWind.max,
      5 // Wind tolerance
    );
    
    const precipScore = this.scoreInRange(
      weather.precipitation,
      conditions.beneficialPrecipitation.min,
      conditions.beneficialPrecipitation.max,
      2 // Precipitation tolerance
    );

    // Overall score (weighted average)
    const overall = (
      tempScore * 0.4 +      // Temperature most important
      humidityScore * 0.25 +  // Humidity second
      windScore * 0.2 +       // Wind third
      precipScore * 0.15      // Precipitation least critical
    );

    // Normalize to 0-100 scale
    const normalized = Math.max(0, Math.min(100, overall));

    // Determine farming outlook
    let farmingOutlook: 'excellent' | 'good' | 'fair' | 'poor';
    if (normalized >= 80) farmingOutlook = 'excellent';
    else if (normalized >= 60) farmingOutlook = 'good'; 
    else if (normalized >= 40) farmingOutlook = 'fair';
    else farmingOutlook = 'poor';

    return {
      score: normalized,
      factors: {
        temperature: tempScore / 100,
        humidity: humidityScore / 100,
        wind: windScore / 100,
        precipitation: precipScore / 100
      },
      interpretation: {
        farmingOutlook,
        weatherCategory: weather.conditions
      }
    };
  }

  /**
   * Score a value based on optimal range
   */
  private scoreInRange(value: number, min: number, max: number, tolerance: number): number {
    if (value >= min && value <= max) {
      return 100; // Perfect score in optimal range
    }
    
    // Calculate distance from range
    const distanceBelow = min - value;
    const distanceAbove = value - max;
    const distance = Math.max(distanceBelow, distanceAbove, 0);
    
    // Score decreases with distance, reaches 0 at tolerance limit
    return Math.max(0, 100 - (distance / tolerance) * 100);
  }

  /**
   * Get weather interpretation for farming decisions
   */
  getWeatherInterpretation(score: WeatherScore): {
    category: string;
    description: string;
    farmingOutlook: 'excellent' | 'good' | 'fair' | 'poor' | 'challenging';
  } {
    const normalized = score.score;
    
    if (normalized >= 80) {
      return {
        category: 'Excellent Growing Conditions',
        description: 'Perfect weather for kale farming',
        farmingOutlook: 'excellent'
      };
    } else if (normalized >= 60) {
      return {
        category: 'Good Growing Conditions',
        description: 'Favorable weather for kale cultivation',
        farmingOutlook: 'good'
      };
    } else if (normalized >= 40) {
      return {
        category: 'Fair Growing Conditions',
        description: 'Moderate weather conditions for farming',
        farmingOutlook: 'fair'
      };
    } else if (normalized >= 20) {
      return {
        category: 'Poor Growing Conditions',
        description: 'Challenging weather for kale farming',
        farmingOutlook: 'poor'
      };
    } else {
      return {
        category: 'Very Poor Growing Conditions',
        description: 'Extremely challenging weather for cultivation',
        farmingOutlook: 'challenging'
      };
    }
  }

  /**
   * Test API connectivity
   */
  async testApiConnectivity(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    for (const [name, api] of Object.entries(this.APIs)) {
      if (!api.enabled) {
        results[name] = false;
        continue;
      }
      
      try {
        // Test with London coordinates
        const testLocation: Location = {
          id: 'test',
          name: 'London',
          country: 'UK',
          coordinates: { lat: 51.5074, lon: -0.1278 },
          populationWeight: 1,
          timezone: 'Europe/London'
        };
        
        let testSuccess = false;
        if (name === 'openweather') {
          const result = await this.fetchFromOpenWeather(testLocation);
          testSuccess = result.success;
        }
        
        results[name] = testSuccess;
      } catch (error) {
        results[name] = false;
      }
    }
    
    return results;
  }
}

export default WeatherApiService;
export type { WeatherData };