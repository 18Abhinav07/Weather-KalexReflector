// Oracle and DAO types for weather prediction system

export interface OracleSource {
  name: string;
  contractId: string;
  description: string;
  updateFrequency: number; // minutes
  retention: number; // hours
}

export interface PriceData {
  price: bigint;
  timestamp: number;
}

export interface Asset {
  symbol: string;
  type: 'crypto' | 'forex' | 'stellar';
}

export interface OracleData {
  source: OracleSource;
  timestamp: number;
  assets: Map<string, PriceData>;
  isValid: boolean;
  lastUpdate: number;
}

export interface DAOVote {
  daoId: string;
  prediction: WeatherOutcome;
  confidence: number; // 0.1 to 1.0
  cycleId: number;
  timestamp: number;
  reasoning?: string;
}

export enum WeatherOutcome {
  GOOD = 1,
  BAD = -1
}

export interface DAOConfig {
  id: string;
  name: string;
  philosophy: string;
  weight: number;
  isActive: boolean;
  accuracy: number;
  totalPredictions: number;
  correctPredictions: number;
}

export interface ConsensusResult {
  cycleId: number;
  consensusScore: number; // -1 to +1
  finalWeather: WeatherOutcome;
  votes: DAOVote[];
  timestamp: number;
  tieBreaker?: boolean;
}

export interface OracleAssetData {
  // Crypto prices (from External CEX & DEX)
  btc_current?: bigint;
  btc_prev?: bigint;
  eth_current?: bigint;
  eth_prev?: bigint;
  xlm_current?: bigint;
  xlm_prev?: bigint;
  sol_current?: bigint;
  sol_prev?: bigint;
  usdt_current?: bigint;
  usdc_current?: bigint;
  
  // Stellar ecosystem (from Stellar Pubnet)
  kale_current?: bigint;
  kale_prev?: bigint;
  aqua_current?: bigint;
  aqua_prev?: bigint;
  eurc_current?: bigint;
  
  // Forex rates (from Foreign Exchange)
  eur_usd?: bigint;
  gbp_usd?: bigint;
  cad_usd?: bigint;
  brl_usd?: bigint;
  
  // Metadata
  timestamp: number;
  dataQuality: 'GOOD' | 'PARTIAL' | 'POOR';
  oraclesAvailable: number; // out of 3
}

export interface DAOAnalysis {
  daoId: string;
  prediction: WeatherOutcome;
  confidence: number;
  dataUsed: string[];
  reasoning: string;
  processingTime: number; // milliseconds
}

export interface VotingCycle {
  cycleId: number;
  blockIndex: number;
  startTime: number;
  oracleData: OracleAssetData;
  daoVotes: DAOVote[];
  consensusResult?: ConsensusResult;
  status: 'oracle_query' | 'dao_analysis' | 'vote_submission' | 'consensus' | 'completed';
}