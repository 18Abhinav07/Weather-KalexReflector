import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import WeatherApiService, { type WeatherApiResult, type WeatherScore } from '../services/weatherApiService.js';
import type { Location } from '../services/locationSelector.js';
import axios from 'axios';

// Mock axios
mock.module('axios', () => ({
  default: {
    get: mock(() => Promise.resolve({ data: {} }))
  }
}));

describe('WeatherApiService', () => {
  let weatherApiService: WeatherApiService;
  let mockLocation: Location;

  beforeEach(() => {
    weatherApiService = new WeatherApiService();
    mockLocation = {
      id: 'tokyo-jp',
      name: 'Tokyo',
      country: 'Japan',
      coordinates: { lat: 35.6762, lon: 139.6503 },
      populationWeight: 13.9,
      timezone: 'Asia/Tokyo'
    };
  });

  describe('Constructor', () => {
    it('should initialize with correct API keys and URLs', () => {
      expect(weatherApiService).toBeDefined();
      expect((weatherApiService as any).APIs.openweather.enabled).toBe(true);
      expect((weatherApiService as any).APIs.openweather.key).toBeDefined();
      expect((weatherApiService as any).APIs.openweather.url).toContain('openweathermap.org');
    });

    it('should have OpenWeatherMap provider configured', () => {
      const service = new WeatherApiService();
      const apis = (service as any).APIs;
      expect(Object.keys(apis)).toHaveLength(1);
      expect(apis.openweather.name).toBe('OpenWeatherMap');
      expect(apis.openweather.enabled).toBe(true);
    });
  });

  describe('fetchWeatherForLocation', () => {
    it('should successfully fetch weather from OpenWeatherMap', async () => {
      const mockWeatherData = {
        weather: [{ main: 'Clear', description: 'clear sky' }],
        main: { 
          temp: 18.5, 
          humidity: 65, 
          feels_like: 17.2 
        },
        wind: { speed: 3.2 },
        rain: undefined,
        snow: undefined
      };

      spyOn(axios, 'get').mockResolvedValue({ data: mockWeatherData });

      const result = await weatherApiService.fetchWeatherForLocation(mockLocation);

      expect(result.success).toBe(true);
      expect(result.weather).toBeDefined();
      expect(result.weather!.data.temperature).toBe(18.5);
      expect(result.weather!.data.humidity).toBe(65);
      expect(result.weather!.data.conditions).toBe('clear sky');
      expect(result.weather!.source).toBe('OpenWeatherMap');
    });


    it('should return failure when OpenWeatherMap fails', async () => {
      spyOn(axios, 'get')
        .mockRejectedValue(new Error('API failed'));

      const result = await weatherApiService.fetchWeatherForLocation(mockLocation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('All weather APIs failed');
    });

    it('should handle invalid location coordinates', async () => {
      const invalidLocation = {
        ...mockLocation,
        coordinates: { lat: 999, lon: 999 }
      };

      spyOn(axios, 'get').mockRejectedValue(new Error('Invalid coordinates'));

      const result = await weatherApiService.fetchWeatherForLocation(invalidLocation);

      expect(result.success).toBe(false);
    });
  });

  describe('calculateKaleFarmingScore', () => {
    it('should calculate optimal score for ideal kale conditions', () => {
      const idealWeather = {
        temperature: 20, // Within optimal range 18-24°C
        humidity: 65,    // Within optimal range 60-70%
        conditions: 'partly cloudy',
        windSpeed: 10,   // Within optimal range 5-15 km/h
        precipitation: 1, // Within beneficial range 0.5-5mm
        source: 'test',
        timestamp: new Date()
      };

      const score = weatherApiService.calculateKaleFarmingScore(idealWeather);

      expect(score.score).toBeGreaterThan(80);
      expect(score.factors.temperature).toBeGreaterThan(0.9);
      expect(score.factors.humidity).toBeGreaterThan(0.9);
      expect(score.factors.wind).toBeGreaterThan(0.8);
      expect(score.factors.precipitation).toBe(1.0);
    });

    it('should penalize extreme temperatures', () => {
      const hotWeather = {
        temperature: 35,
        humidity: 50,
        conditions: 'clear',
        windSpeed: 5,
        precipitation: 0,
        source: 'test',
        timestamp: new Date()
      };

      const coldWeather = {
        temperature: -5,
        humidity: 60,
        conditions: 'snow',
        windSpeed: 10,
        precipitation: 2,
        source: 'test',
        timestamp: new Date()
      };

      const hotScore = weatherApiService.calculateKaleFarmingScore(hotWeather);
      const coldScore = weatherApiService.calculateKaleFarmingScore(coldWeather);

      expect(hotScore.factors.temperature).toBeLessThan(0.3);
      expect(coldScore.factors.temperature).toBeLessThan(0.2);
      expect(hotScore.score).toBeLessThan(50);
      expect(coldScore.score).toBeLessThan(30);
    });

    it('should handle extreme weather conditions correctly', () => {
      const stormWeather = {
        temperature: 20,
        humidity: 95,
        conditions: 'thunderstorm',
        windSpeed: 40,
        precipitation: 15,
        source: 'test',
        timestamp: new Date()
      };

      const score = weatherApiService.calculateKaleFarmingScore(stormWeather);

      expect(score.score).toBeLessThan(20);
      expect(score.factors.wind).toBeLessThan(0.2);
      expect(score.factors.precipitation).toBeLessThan(0.3);
      expect(score.interpretation?.farmingOutlook).toBe('poor');
    });

    it('should provide correct farming interpretations', () => {
      const excellentWeather = { temperature: 21, humidity: 65, conditions: 'clear', windSpeed: 8, precipitation: 1, source: 'test', timestamp: new Date() };
      const goodWeather = { temperature: 18, humidity: 75, conditions: 'cloudy', windSpeed: 12, precipitation: 1, source: 'test', timestamp: new Date() };
      const fairWeather = { temperature: 22, humidity: 80, conditions: 'rain', windSpeed: 15, precipitation: 5, source: 'test', timestamp: new Date() };
      const poorWeather = { temperature: 30, humidity: 95, conditions: 'thunderstorm', windSpeed: 30, precipitation: 20, source: 'test', timestamp: new Date() };

      expect(weatherApiService.calculateKaleFarmingScore(excellentWeather).interpretation?.farmingOutlook).toBe('excellent');
      expect(weatherApiService.calculateKaleFarmingScore(goodWeather).interpretation?.farmingOutlook).toBe('good');
      expect(weatherApiService.calculateKaleFarmingScore(fairWeather).interpretation?.farmingOutlook).toBe('fair');
      expect(weatherApiService.calculateKaleFarmingScore(poorWeather).interpretation?.farmingOutlook).toBe('poor');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      spyOn(axios, 'get').mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });

      const result = await weatherApiService.fetchWeatherForLocation(mockLocation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle API rate limiting', async () => {
      spyOn(axios, 'get').mockRejectedValue({ response: { status: 429, statusText: 'Too Many Requests' } });

      const result = await weatherApiService.fetchWeatherForLocation(mockLocation);

      expect(result.success).toBe(false);
    });

    it('should handle malformed API responses', async () => {
      spyOn(axios, 'get').mockResolvedValue({ data: { invalid: 'data' } });

      const result = await weatherApiService.fetchWeatherForLocation(mockLocation);

      expect(result.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should fetch weather within reasonable time', async () => {
      const mockData = {
        weather: [{ main: 'Clear' }],
        main: { temp: 20, humidity: 60 },
        wind: { speed: 5 }
      };
      spyOn(axios, 'get').mockResolvedValue({ data: mockData });

      const start = performance.now();
      await weatherApiService.fetchWeatherForLocation(mockLocation);
      const end = performance.now();

      expect(end - start).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should handle multiple concurrent requests', async () => {
      const mockData = {
        weather: [{ main: 'Clear' }],
        main: { temp: 20, humidity: 60 },
        wind: { speed: 5 }
      };
      spyOn(axios, 'get').mockResolvedValue({ data: mockData });

      const locations = [
        { ...mockLocation, id: 'loc1', name: 'Location 1' },
        { ...mockLocation, id: 'loc2', name: 'Location 2' },
        { ...mockLocation, id: 'loc3', name: 'Location 3' }
      ];

      const promises = locations.map(loc => 
        weatherApiService.fetchWeatherForLocation(loc)
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Data Validation', () => {
    it('should validate temperature data is numeric', () => {
      const invalidWeather = {
        temperature: 'hot' as any,
        humidity: 60,
        conditions: 'sunny',
        windSpeed: 5,
        precipitation: 0,
        source: 'test',
        timestamp: new Date()
      };

      expect(() => {
        weatherApiService.calculateKaleFarmingScore(invalidWeather);
      }).toThrow();
    });

    it('should handle missing weather data fields', () => {
      const incompleteWeather = {
        temperature: 20,
        // Missing other fields
      } as any;

      expect(() => {
        weatherApiService.calculateKaleFarmingScore(incompleteWeather);
      }).not.toThrow(); // Should handle gracefully with defaults
    });

    it('should normalize extreme humidity values', () => {
      const weather1 = { temperature: 20, humidity: 150, conditions: 'clear', windSpeed: 5, precipitation: 0, source: 'test', timestamp: new Date() };
      const weather2 = { temperature: 20, humidity: -10, conditions: 'clear', windSpeed: 5, precipitation: 0, source: 'test', timestamp: new Date() };

      const score1 = weatherApiService.calculateKaleFarmingScore(weather1);
      const score2 = weatherApiService.calculateKaleFarmingScore(weather2);

      expect(score1.factors.humidity).toBeLessThanOrEqual(1.0);
      expect(score2.factors.humidity).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('API Key Management', () => {
    it('should handle missing API keys gracefully', () => {
      // Test with environment variables cleared
      const originalKeys = {
        openweather: process.env.OPENWEATHERMAP_API_KEY,
        weather: process.env.WEATHER_API_KEY,
        visual: process.env.VISUAL_CROSSING_API_KEY
      };

      delete process.env.OPENWEATHERMAP_API_KEY;
      delete process.env.WEATHER_API_KEY;
      delete process.env.VISUAL_CROSSING_API_KEY;

      expect(() => new WeatherApiService()).not.toThrow();

      // Restore keys
      if (originalKeys.openweather) process.env.OPENWEATHERMAP_API_KEY = originalKeys.openweather;
      if (originalKeys.weather) process.env.WEATHER_API_KEY = originalKeys.weather;
      if (originalKeys.visual) process.env.VISUAL_CROSSING_API_KEY = originalKeys.visual;
    });
  });
});

// Integration tests with real API calls (commented out for CI)
describe.skip('WeatherApiService Integration Tests', () => {
  let weatherApiService: WeatherApiService;

  beforeEach(() => {
    weatherApiService = new WeatherApiService();
  });

  it('should fetch real weather data from OpenWeatherMap', async () => {
    const tokyo: Location = {
      id: 'tokyo-jp',
      name: 'Tokyo',
      country: 'Japan',  
      coordinates: { lat: 35.6762, lon: 139.6503 },
      populationWeight: 13.9,
      timezone: 'Asia/Tokyo'
    };

    const result = await weatherApiService.fetchWeatherForLocation(tokyo);
    
    expect(result.success).toBe(true);
    expect(result.weather).toBeDefined();
    expect(result.weather!.data.temperature).toBeGreaterThan(-50);
    expect(result.weather!.data.temperature).toBeLessThan(60);
  }, 10000);
});