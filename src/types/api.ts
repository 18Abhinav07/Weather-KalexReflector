// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Database Row Types
export interface DatabaseRow {
  [key: string]: any;
}

// Cycle Types
export interface CycleRow extends DatabaseRow {
  cycle_id: string;
  current_state: string;
  start_block: string;
  current_block: string;
  weather_outcome?: string;
  weather_confidence?: number;
  final_weather_score?: number;
  revealed_location_name?: string;
  current_weather_data?: string;
  completed_at?: string;
  weather_score?: string;
}

// Wager Types
export interface WagerRow extends DatabaseRow {
  wager_id: string;
  user_id: string;
  cycle_id: string;
  wager_type: 'good' | 'bad';
  amount: number;
  placed_at: string;
  payout_amount?: number;
  is_winner?: boolean;
}

// Action Types
export interface ActionRow extends DatabaseRow {
  block_number: string;
  action_type: string;
  action_data: any;
  created_at: string;
}

// Participant Types
export interface ParticipantRow extends DatabaseRow {
  user_id: string;
  action_type: string;
  action_data: any;
  stake_amount?: number;
}

// Weather API Response Types
export interface WeatherApiResponse {
  success: boolean;
  weather?: {
    data: {
      temperature: number;
      humidity: number;
      conditions: string;
      windSpeed: number;
      precipitation: number;
      source: string;
      timestamp: Date;
    };
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

// Wager Service Response Types
export interface WagerServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Error Types
export type ApiError = Error | { message: string } | string | unknown;

export function getErrorMessage(error: ApiError): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}