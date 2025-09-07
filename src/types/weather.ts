// Weather-related TypeScript types

export interface WeatherData {
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

// Legacy score format for backward compatibility
export interface LegacyWeatherScore {
  normalized: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  overall: number;
}

// Convert legacy score to new format
export function convertLegacyScore(legacy: LegacyWeatherScore): WeatherScore {
  const score = legacy.normalized;
  
  // Determine farming outlook
  let farmingOutlook: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 80) farmingOutlook = 'excellent';
  else if (score >= 60) farmingOutlook = 'good';
  else if (score >= 40) farmingOutlook = 'fair';
  else farmingOutlook = 'poor';

  return {
    score,
    factors: {
      temperature: legacy.temperature / 100,
      humidity: legacy.humidity / 100,
      wind: legacy.windSpeed / 100,
      precipitation: legacy.precipitation / 100
    },
    interpretation: {
      farmingOutlook
    }
  };
}