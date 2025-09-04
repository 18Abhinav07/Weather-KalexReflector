// DAO API Endpoints - Public interface for vote calculation and revelation
// Following the API specification from DAOCreation.md

import type { Request, Response } from 'express';
import { ReflectorClient } from '../oracle/reflector-client';
import { DAORegistry } from '../dao/dao-registry';
import { WeightedVotingSystem, TieBreakerData } from '../consensus/weighted-voting';
import { 
  VotingCycle, 
  ConsensusResult, 
  DAOVote, 
  WeatherOutcome,
  OracleAssetData 
} from '../types/oracle-types';

// Import DAO philosophy implementations
import { CryptoMomentumDAO } from '../dao/philosophies/crypto-momentum-dao';
import { KalePerformanceDAO } from '../dao/philosophies/kale-performance-dao';
import { XlmDominanceDAO } from '../dao/philosophies/xlm-dominance-dao';

export class DAOApiController {
  private reflectorClient: ReflectorClient;
  private daoRegistry: DAORegistry;
  private votingSystem: WeightedVotingSystem;
  private activeCycles: Map<number, VotingCycle> = new Map();

  constructor(rpcUrl: string, env: any) {
    this.reflectorClient = new ReflectorClient(rpcUrl, env);
    this.daoRegistry = new DAORegistry();
    this.votingSystem = new WeightedVotingSystem();
    
    // Register DAO philosophy implementations
    this.setupDAOPhilosophies();
  }

  /**
   * Setup DAO philosophy implementations
   */
  private setupDAOPhilosophies(): void {
    this.daoRegistry.registerPhilosophy('crypto-momentum', new CryptoMomentumDAO());
    this.daoRegistry.registerPhilosophy('kale-performance', new KalePerformanceDAO());
    this.daoRegistry.registerPhilosophy('xlm-dominance', new XlmDominanceDAO());
    
    // TODO: Register remaining DAO philosophies
    console.log('DAO philosophies registered: 3/15+ implementations');
  }

  /**
   * POST /api/dao/calculate-votes  
   * Trigger vote calculation for a specific block index
   */
  calculateVotes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { blockIndex } = req.body;

      if (!blockIndex || typeof blockIndex !== 'number') {
        res.status(400).json({
          success: false,
          error: 'Missing or invalid required parameter: blockIndex (must be a number)'
        });
        return;
      }

      const cycleId = blockIndex; // Use blockIndex as cycleId for simplicity
      console.log(`Starting vote calculation for block ${blockIndex}`);

      // Step 1: Get block data (including entropy) from KALE contract
      const blockFetcher = new (await import('../blockchain/block-fetcher')).BlockDataFetcher(
        process.env.STELLAR_RPC_URL || 'https://horizon-testnet.stellar.org',
        process.env.STELLAR_CONTRACT_ID || 'mock-contract-id'
      );
      
      const blockData = await blockFetcher.getBlockData(blockIndex);
      if (!blockData) {
        res.status(404).json({
          success: false,
          error: `Block data not found for index ${blockIndex}`
        });
        return;
      }

      const blockEntropy = blockData.entropy?.toString('hex') || Math.random().toString(36).substring(2, 18);
      console.log(`Block data retrieved: entropy=${blockEntropy.substring(0, 8)}..., timestamp=${blockData.timestamp}`);

      // Step 2: Fetch oracle data
      const oracleData = await this.reflectorClient.fetchAllOracleData();
      console.log(`Oracle data fetched: ${oracleData.oraclesAvailable}/3 sources, quality: ${oracleData.dataQuality}`);

      // Step 3: Run DAO analysis
      const votes = await this.daoRegistry.runAnalysis(oracleData, cycleId);
      console.log(`DAO analysis complete: ${votes.length} votes collected`);

      // Step 4: Calculate consensus
      const tieBreakerData: TieBreakerData = {
        blockEntropy,
        cycleId
      };

      const activeDAOs = new Map();
      this.daoRegistry.getActiveDAOs().forEach(dao => {
        activeDAOs.set(dao.id, dao);
      });

      const consensusResult = this.votingSystem.calculateConsensus(
        votes,
        activeDAOs,
        cycleId,
        tieBreakerData
      );

      // Step 5: Store voting cycle
      const votingCycle: VotingCycle = {
        cycleId,
        blockIndex,
        startTime: Date.now(),
        oracleData,
        daoVotes: votes,
        consensusResult,
        status: 'completed'
      };

      this.activeCycles.set(cycleId, votingCycle);

      // Step 6: Return results
      const analysis = this.votingSystem.analyzeConsensus(consensusResult);
      
      res.json({
        success: true,
        cycleId,
        blockIndex,
        blockData: {
          entropy: blockEntropy,
          timestamp: blockData.timestamp?.toString(),
          minStake: blockData.min_stake?.toString(),
          maxStake: blockData.max_stake?.toString()
        },
        consensusResult: {
          finalWeather: consensusResult.finalWeather === WeatherOutcome.GOOD ? 'GOOD' : 'BAD',
          consensusScore: consensusResult.consensusScore,
          tieBreaker: consensusResult.tieBreaker,
          timestamp: consensusResult.timestamp
        },
        analysis: {
          strength: analysis.strength,
          agreement: analysis.agreement,
          summary: analysis.summary
        },
        oracleData: {
          quality: oracleData.dataQuality,
          sourcesAvailable: oracleData.oraclesAvailable,
          timestamp: oracleData.timestamp
        },
        voteCount: votes.length,
        processingTime: Date.now() - votingCycle.startTime
      });

    } catch (error) {
      console.error('Vote calculation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Vote calculation failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };

  /**
   * GET /api/dao/reveal-votes/:cycleId
   * Retrieve DAO predictions for a specific cycle
   */
  revealVotes = async (req: Request, res: Response): Promise<void> => {
    try {
      const cycleId = parseInt(req.params.cycleId);

      if (isNaN(cycleId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid cycle ID'
        });
        return;
      }

      const votingCycle = this.activeCycles.get(cycleId);
      if (!votingCycle) {
        res.status(404).json({
          success: false,
          error: `Voting cycle ${cycleId} not found`
        });
        return;
      }

      // Format DAO votes for public display
      const daoVotes = votingCycle.daoVotes.map(vote => {
        const daoConfig = this.daoRegistry.getDAO(vote.daoId);
        return {
          daoId: vote.daoId,
          daoName: daoConfig?.name || vote.daoId,
          philosophy: daoConfig?.philosophy || 'Unknown philosophy',
          prediction: vote.prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD',
          confidence: Math.round(vote.confidence * 100), // Convert to percentage
          weight: daoConfig?.weight || 0.5,
          accuracy: daoConfig ? Math.round(daoConfig.accuracy * 100) : null,
          reasoning: vote.reasoning
        };
      });

      // Sort by confidence (highest first) for better display
      daoVotes.sort((a, b) => b.confidence - a.confidence);

      const response = {
        success: true,
        cycleId,
        blockIndex: votingCycle.blockIndex,
        status: votingCycle.status,
        timestamp: votingCycle.startTime,
        daoVotes,
        totalVotes: daoVotes.length,
        consensusResult: votingCycle.consensusResult ? {
          finalWeather: votingCycle.consensusResult.finalWeather === WeatherOutcome.GOOD ? 'GOOD' : 'BAD',
          consensusScore: Math.round(votingCycle.consensusResult.consensusScore * 1000) / 1000, // 3 decimal places
          tieBreaker: votingCycle.consensusResult.tieBreaker
        } : null,
        oracleData: {
          quality: votingCycle.oracleData.dataQuality,
          sourcesAvailable: votingCycle.oracleData.oraclesAvailable,
          timestamp: votingCycle.oracleData.timestamp
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Vote revelation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reveal votes',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };

  /**
   * GET /api/dao/performance/:daoId
   * Get DAO historical performance metrics
   */
  getDAOPerformance = async (req: Request, res: Response): Promise<void> => {
    try {
      const daoId = req.params.daoId;

      const daoConfig = this.daoRegistry.getDAO(daoId);
      if (!daoConfig) {
        res.status(404).json({
          success: false,
          error: `DAO ${daoId} not found`
        });
        return;
      }

      const performance = this.daoRegistry.getDAOPerformance(daoId);
      if (!performance) {
        res.status(404).json({
          success: false,
          error: `Performance data not available for ${daoId}`
        });
        return;
      }

      res.json({
        success: true,
        daoId,
        name: daoConfig.name,
        philosophy: daoConfig.philosophy,
        weight: daoConfig.weight,
        isActive: daoConfig.isActive,
        performance: {
          accuracy: Math.round(performance.accuracy * 100), // Convert to percentage
          totalPredictions: performance.totalPredictions,
          correctPredictions: performance.correctPredictions,
          incorrectPredictions: performance.totalPredictions - performance.correctPredictions
        }
      });

    } catch (error) {
      console.error('DAO performance query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get DAO performance',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };

  /**
   * GET /api/dao/status
   * Get overall system status
   */
  getSystemStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const activeDAOs = this.daoRegistry.getActiveDAOs();
      const activeCycleCount = this.activeCycles.size;
      
      // Get oracle status (simplified)
      const oracleStatus = {
        sources: this.reflectorClient.getOracleSources().map(source => ({
          name: source.name,
          contractId: source.contractId,
          updateFrequency: source.updateFrequency,
          status: 'connected' // TODO: Implement actual status checking
        }))
      };

      res.json({
        success: true,
        timestamp: Date.now(),
        system: {
          status: 'operational',
          activeCycles: activeCycleCount,
          totalDAOs: activeDAOs.length
        },
        daos: activeDAOs.map(dao => ({
          id: dao.id,
          name: dao.name,
          weight: dao.weight,
          accuracy: Math.round(dao.accuracy * 100),
          isActive: dao.isActive
        })),
        oracles: oracleStatus
      });

    } catch (error) {
      console.error('System status query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system status',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
}