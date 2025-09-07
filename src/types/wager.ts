// Wager-related TypeScript types

export enum WagerDirection {
  BET_GOOD = 'good',
  BET_BAD = 'bad'
}

export interface WagerPosition {
  wagerId: string;
  userId: string;
  cycleId: bigint;
  direction: WagerDirection;
  stakeAmount: number;
  placedAt: Date;
  status: 'active' | 'settled' | 'cancelled';
  finalPayout?: number;
}

export interface WagerPool {
  cycleId: bigint;
  totalGoodStakes: number;
  totalBadStakes: number;
  totalStakes: number;
  betInfluence: number;
  dominantSide: WagerDirection | null;
  influenceStrength: number;
  participantCount: number;
  wagerCount?: number;
  uniqueWagerers?: number;
  goodRatio?: number;
  badRatio?: number;
}

export interface WagerInfluenceResult {
  betInfluence: number; // -2.0 to +2.0 range
  totalStakes: number;
  goodStakes: number;
  badStakes: number;
  dominantSide: WagerDirection | null;
  stakeRatio: number;
  influenceStrength: number;
  goodRatio?: number;
  badRatio?: number;
}

export interface WagerPayoutResult {
  wagerId: string;
  userId: string;
  originalStake: number;
  payout: number;
  profitLoss: number;
  payoutRatio: number;
  isWinner?: boolean;
}

export interface WagerHistory {
  wagerId: string;
  userId: string;
  cycleId: bigint;
  direction: WagerDirection;
  stakeAmount: number;
  placedAt: Date;
  payoutAmount?: number;
  isWinner?: boolean;
  status: 'active' | 'settled' | 'cancelled';
}

// API Response types for wager service
export interface WagerServiceResponse<T = any> {
  success: boolean;
  data?: T;
  wager?: WagerPosition;
  error?: string;
}