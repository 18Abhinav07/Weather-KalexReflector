// DAO Registry - Manages all DAO configurations and voting logic
// Based on DAOCreation.md specifications

import { DAOConfig, DAOVote, WeatherOutcome, OracleAssetData, DAOAnalysis } from '../types/oracle-types';

export interface DAOPhilosophy {
  analyze(data: OracleAssetData): DAOAnalysis;
}

export class DAORegistry {
  private daos: Map<string, DAOConfig> = new Map();
  private philosophies: Map<string, DAOPhilosophy> = new Map();
  private voteHistory: Map<string, DAOVote[]> = new Map(); // keyed by cycleId

  constructor() {
    this.initializeDAOs();
  }

  /**
   * Initialize all DAO configurations as specified in DAOCreation.md
   */
  private initializeDAOs(): void {
    const daoConfigs: DAOConfig[] = [
      // Price Movement Based DAOs
      {
        id: 'crypto-momentum',
        name: 'Crypto Momentum DAO',
        philosophy: 'Tracks BTC/ETH/XLM 5-minute momentum. GOOD if 2+ assets show >1% positive movement',
        weight: 1.0,
        isActive: true,
        accuracy: 0.67, // Initial accuracy from spec
        totalPredictions: 200,
        correctPredictions: 134
      },
      {
        id: 'mean-reversion',
        name: 'Mean Reversion DAO',
        philosophy: 'Tracks 1-hour price ranges, predicts BAD when assets >2 std dev from mean',
        weight: 0.8,
        isActive: true,
        accuracy: 0.63,
        totalPredictions: 200,
        correctPredictions: 126
      },
      {
        id: 'xlm-dominance',
        name: 'XLM Dominance DAO',
        philosophy: 'Compares XLM vs BTC/ETH performance. GOOD if XLM outperforming >5%',
        weight: 1.0,
        isActive: true,
        accuracy: 0.71,
        totalPredictions: 200,
        correctPredictions: 142
      },
      {
        id: 'kale-performance',
        name: 'KALE Performance DAO',
        philosophy: 'Tracks KALE/USDC price trend. GOOD if KALE up >2% in 15min, BAD if down >2%',
        weight: 1.0,
        isActive: true,
        accuracy: 0.65,
        totalPredictions: 150,
        correctPredictions: 98
      },
      
      // Volatility and Risk Based DAOs
      {
        id: 'volatility-clustering',
        name: 'Volatility Clustering DAO',
        philosophy: 'Calculates volatility from price returns. BAD if volatility clustering detected',
        weight: 0.9,
        isActive: true,
        accuracy: 0.69,
        totalPredictions: 200,
        correctPredictions: 138
      },
      {
        id: 'flight-to-safety',
        name: 'Flight to Safety DAO',
        philosophy: 'Measures crypto-stablecoin correlation. BAD if correlation >0.8',
        weight: 0.7,
        isActive: true,
        accuracy: 0.58,
        totalPredictions: 150,
        correctPredictions: 87
      },
      {
        id: 'cross-chain-stress',
        name: 'Cross-Chain Stress DAO',
        philosophy: 'Monitors bridge token premiums. BAD if any >2% premium/discount',
        weight: 0.6,
        isActive: true,
        accuracy: 0.62,
        totalPredictions: 120,
        correctPredictions: 74
      },

      // Stellar Ecosystem Specific DAOs
      {
        id: 'stellar-dex-health',
        name: 'Stellar DEX Health DAO',
        philosophy: 'Counts active Stellar tokens >$1k volume. GOOD if >15, BAD if <10',
        weight: 1.0,
        isActive: true,
        accuracy: 0.73,
        totalPredictions: 180,
        correctPredictions: 131
      },
      {
        id: 'aqua-network',
        name: 'AQUA Network DAO',
        philosophy: 'Uses AQUA price as ecosystem health. GOOD if AQUA/USDC up >3% in 20min',
        weight: 0.8,
        isActive: true,
        accuracy: 0.64,
        totalPredictions: 160,
        correctPredictions: 102
      },
      {
        id: 'regional-token',
        name: 'Regional Token DAO',
        philosophy: 'Tracks emerging market tokens. BAD if any regional token down >5%',
        weight: 0.4,
        isActive: true,
        accuracy: 0.59,
        totalPredictions: 100,
        correctPredictions: 59
      },

      // Market Structure Based DAOs
      {
        id: 'correlation-breakdown',
        name: 'Correlation Breakdown DAO',
        philosophy: 'Measures cross-asset correlations. GOOD if <0.3, BAD if >0.7',
        weight: 0.9,
        isActive: true,
        accuracy: 0.76,
        totalPredictions: 180,
        correctPredictions: 137
      },
      {
        id: 'liquidity-premium',
        name: 'Liquidity Premium DAO',
        philosophy: 'Compares same assets across oracles. BAD if spreads >1%',
        weight: 0.7,
        isActive: true,
        accuracy: 0.61,
        totalPredictions: 140,
        correctPredictions: 85
      },
      {
        id: 'stablecoin-peg',
        name: 'Stablecoin Peg DAO',
        philosophy: 'Monitors USDT/USDC/EURC peg stability. BAD if any >0.5% off peg',
        weight: 0.8,
        isActive: true,
        accuracy: 0.68,
        totalPredictions: 170,
        correctPredictions: 116
      },

      // Additional DAOs for diversity
      {
        id: 'multi-timeframe',
        name: 'Multi-Timeframe DAO',
        philosophy: 'Analyzes multiple timeframes for convergence signals',
        weight: 0.6,
        isActive: true,
        accuracy: 0.55,
        totalPredictions: 100,
        correctPredictions: 55
      },
      {
        id: 'volume-price',
        name: 'Volume-Price DAO',
        philosophy: 'Correlates volume with price movements for validation',
        weight: 0.5,
        isActive: true,
        accuracy: 0.52,
        totalPredictions: 100,
        correctPredictions: 52
      }
    ];

    // Register all DAOs
    daoConfigs.forEach(config => {
      this.daos.set(config.id, config);
    });
  }

  /**
   * Register a DAO philosophy implementation
   */
  registerPhilosophy(daoId: string, philosophy: DAOPhilosophy): void {
    this.philosophies.set(daoId, philosophy);
  }

  /**
   * Run analysis for all active DAOs
   */
  async runAnalysis(oracleData: OracleAssetData, cycleId: number): Promise<DAOVote[]> {
    const votes: DAOVote[] = [];
    const analysisPromises: Promise<DAOVote>[] = [];

    // Run analysis for each active DAO
    for (const [daoId, config] of this.daos) {
      if (!config.isActive) continue;

      const philosophy = this.philosophies.get(daoId);
      if (!philosophy) {
        console.warn(`No philosophy implementation found for DAO: ${daoId}`);
        continue;
      }

      // Run analysis in parallel for performance
      const analysisPromise = this.runSingleAnalysis(daoId, philosophy, oracleData, cycleId);
      analysisPromises.push(analysisPromise);
    }

    // Wait for all analyses to complete
    const results = await Promise.allSettled(analysisPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        votes.push(result.value);
      } else {
        console.error(`Analysis failed for DAO:`, result.reason);
      }
    });

    // Store votes in history
    this.voteHistory.set(cycleId.toString(), votes);

    return votes;
  }

  /**
   * Run analysis for a single DAO
   */
  private async runSingleAnalysis(
    daoId: string, 
    philosophy: DAOPhilosophy, 
    oracleData: OracleAssetData, 
    cycleId: number
  ): Promise<DAOVote> {
    const startTime = Date.now();
    
    try {
      const analysis = philosophy.analyze(oracleData);
      
      const vote: DAOVote = {
        daoId,
        prediction: analysis.prediction,
        confidence: analysis.confidence,
        cycleId,
        timestamp: Date.now(),
        reasoning: analysis.reasoning
      };

      console.log(`${daoId} analysis: ${analysis.prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD'} (confidence: ${analysis.confidence})`);
      
      return vote;
    } catch (error) {
      console.error(`Analysis failed for ${daoId}:`, error);
      
      // Return default vote with low confidence on error
      return {
        daoId,
        prediction: WeatherOutcome.BAD, // Default to BAD on error
        confidence: 0.1, // Very low confidence
        cycleId,
        timestamp: Date.now(),
        reasoning: `Error in analysis: ${error}`
      };
    }
  }

  /**
   * Get DAO configuration
   */
  getDAO(daoId: string): DAOConfig | undefined {
    return this.daos.get(daoId);
  }

  /**
   * Get all active DAOs
   */
  getActiveDAOs(): DAOConfig[] {
    return Array.from(this.daos.values()).filter(dao => dao.isActive);
  }

  /**
   * Update DAO accuracy after vote outcome is known
   */
  updateDAOAccuracy(daoId: string, wasCorrect: boolean): void {
    const dao = this.daos.get(daoId);
    if (!dao) return;

    dao.totalPredictions++;
    if (wasCorrect) {
      dao.correctPredictions++;
    }
    dao.accuracy = dao.correctPredictions / dao.totalPredictions;

    this.daos.set(daoId, dao);
  }

  /**
   * Get vote history for a cycle
   */
  getVoteHistory(cycleId: number): DAOVote[] {
    return this.voteHistory.get(cycleId.toString()) || [];
  }

  /**
   * Get DAO performance metrics
   */
  getDAOPerformance(daoId: string): {
    accuracy: number;
    totalPredictions: number;
    correctPredictions: number;
    recentAccuracy?: number;
  } | undefined {
    const dao = this.daos.get(daoId);
    if (!dao) return undefined;

    return {
      accuracy: dao.accuracy,
      totalPredictions: dao.totalPredictions,
      correctPredictions: dao.correctPredictions
      // TODO: Calculate recent accuracy from last N votes
    };
  }
}