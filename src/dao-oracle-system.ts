// Main DAO Oracle System Orchestrator
// Integrates all components to provide the complete voting system

// import { Env } from '@stellar/stellar-sdk'; // Note: Env may need different import
type Env = any; // Placeholder for Stellar Env type
import express, { type Request, type Response } from 'express';
import { ReflectorClient } from './oracle/reflector-client';
import { DAORegistry } from './dao/dao-registry';
import { WeightedVotingSystem } from './consensus/weighted-voting';
import { DAOApiController } from './api/dao-endpoints';
import type { VotingCycle, OracleAssetData, ConsensusResult } from './types/oracle-types';

// Import all DAO philosophy implementations
import { CryptoMomentumDAO } from './dao/philosophies/crypto-momentum-dao';
import { KalePerformanceDAO } from './dao/philosophies/kale-performance-dao';
import { XlmDominanceDAO } from './dao/philosophies/xlm-dominance-dao';
import { MeanReversionDAO } from './dao/philosophies/mean-reversion-dao';
import { VolatilityClusteringDAO } from './dao/philosophies/volatility-clustering-dao';
import { FlightToSafetyDAO } from './dao/philosophies/flight-to-safety-dao';
import { CrossChainStressDAO } from './dao/philosophies/cross-chain-stress-dao';
import { StellarDEXHealthDAO } from './dao/philosophies/stellar-dex-health-dao';
import { AquaNetworkDAO } from './dao/philosophies/aqua-network-dao';
import { RegionalTokenDAO } from './dao/philosophies/regional-token-dao';
import { CorrelationBreakdownDAO } from './dao/philosophies/correlation-breakdown-dao';
import { LiquidityPremiumDAO } from './dao/philosophies/liquidity-premium-dao';
import { StablecoinPegDAO } from './dao/philosophies/stablecoin-peg-dao';
import { MultiTimeframeDAO } from './dao/philosophies/multi-timeframe-dao';
import { VolumePriceDAO } from './dao/philosophies/volume-price-dao';

export interface SystemConfig {
  rpcUrl: string;
  port: number;
  stellarNetwork: 'testnet' | 'mainnet';
  logLevel: 'info' | 'debug' | 'warn' | 'error';
}

export class DAOOracleSystem {
  private reflectorClient: ReflectorClient;
  private daoRegistry: DAORegistry;
  private votingSystem: WeightedVotingSystem;
  private apiController: DAOApiController;
  private app: express.Application;
  private config: SystemConfig;
  private env: Env;

  constructor(config: SystemConfig) {
    this.config = config;
    this.env = this.createStellarEnv();
    
    // Initialize core components
    this.reflectorClient = new ReflectorClient(config.rpcUrl, this.env);
    this.daoRegistry = new DAORegistry();
    this.votingSystem = new WeightedVotingSystem();
    this.apiController = new DAOApiController(config.rpcUrl, this.env);

    // Initialize Express app
    this.app = express();
    this.setupExpress();
    this.setupRoutes();
    this.setupDAOPhilosophies();

    console.log(`DAO Oracle System initialized for ${config.stellarNetwork}`);
  }

  /**
   * Create Stellar environment based on network
   */
  private createStellarEnv(): Env {
    // This is a placeholder - in actual implementation would create proper Stellar Env
    // For now returning a mock object
    return {} as Env;
  }

  /**
   * Setup Express middleware
   */
  private setupExpress(): void {
    // JSON parsing with error handling
    this.app.use(express.json({
      limit: '10mb',
      verify: (req: any, res, buf, encoding) => {
        try {
          JSON.parse(buf.toString());
        } catch (e) {
          console.error('JSON Parse Error:', e);
          throw new Error('Invalid JSON payload');
        }
      }
    }));
    
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });

    // Global error handler for JSON parsing errors
    this.app.use((error: any, req: any, res: any, next: any) => {
      if (error instanceof SyntaxError && 'body' in error) {
        console.error('JSON Parse Error:', error.message);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON format in request body',
          details: 'Please ensure your request body contains valid JSON'
        });
      }
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // DAO voting endpoints
    this.app.post('/api/dao/calculate-votes', this.apiController.calculateVotes);
    this.app.get('/api/dao/reveal-votes/:cycleId', this.apiController.revealVotes);
    this.app.get('/api/dao/performance/:daoId', this.apiController.getDAOPerformance);
    this.app.get('/api/dao/status', this.apiController.getSystemStatus);

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        network: this.config.stellarNetwork
      });
    });

    // Root endpoint with API documentation
    this.app.get('/', (req, res) => {
      res.json({
        name: 'KALE DAO Oracle Voting System',
        version: '1.0.0',
        network: this.config.stellarNetwork,
        endpoints: {
          'POST /api/dao/calculate-votes': 'Trigger vote calculation for a cycle',
          'GET /api/dao/reveal-votes/:cycleId': 'Get DAO votes for a specific cycle',
          'GET /api/dao/performance/:daoId': 'Get DAO performance metrics',
          'GET /api/dao/status': 'Get system status and DAO list',
          'GET /health': 'Health check endpoint'
        },
        documentation: 'See DAOCreation.md for complete API specification'
      });
    });
  }

  /**
   * Register DAO philosophy implementations
   */
  private setupDAOPhilosophies(): void {
    // Register all 15 DAO philosophy implementations
    this.daoRegistry.registerPhilosophy('crypto-momentum', new CryptoMomentumDAO());
    this.daoRegistry.registerPhilosophy('kale-performance', new KalePerformanceDAO());
    this.daoRegistry.registerPhilosophy('xlm-dominance', new XlmDominanceDAO());
    this.daoRegistry.registerPhilosophy('mean-reversion', new MeanReversionDAO());
    this.daoRegistry.registerPhilosophy('volatility-clustering', new VolatilityClusteringDAO());
    this.daoRegistry.registerPhilosophy('flight-to-safety', new FlightToSafetyDAO());
    this.daoRegistry.registerPhilosophy('cross-chain-stress', new CrossChainStressDAO());
    this.daoRegistry.registerPhilosophy('stellar-dex-health', new StellarDEXHealthDAO());
    this.daoRegistry.registerPhilosophy('aqua-network', new AquaNetworkDAO());
    this.daoRegistry.registerPhilosophy('regional-token', new RegionalTokenDAO());
    this.daoRegistry.registerPhilosophy('correlation-breakdown', new CorrelationBreakdownDAO());
    this.daoRegistry.registerPhilosophy('liquidity-premium', new LiquidityPremiumDAO());
    this.daoRegistry.registerPhilosophy('stablecoin-peg', new StablecoinPegDAO());
    this.daoRegistry.registerPhilosophy('multi-timeframe', new MultiTimeframeDAO());
    this.daoRegistry.registerPhilosophy('volume-price', new VolumePriceDAO());

    const activeDAOs = this.daoRegistry.getActiveDAOs();
    console.log(`DAO philosophies registered: ${activeDAOs.length} total DAOs (Phase 2 complete)`);
  }

  /**
   * Perform complete voting cycle for a block (with block data fetching)
   * This is the main entry point for block-triggered voting
   */
  async performVotingCycle(blockIndex: number): Promise<ConsensusResult> {
    const cycleId = blockIndex;
    const startTime = Date.now();

    console.log(`\n🗳️  Starting voting cycle ${cycleId} for block ${blockIndex}`);

    try {
      // Step 1: Get block data from KALE contract
      console.log('🔗 Fetching block data from KALE contract...');
      const blockFetcher = new (await import('./blockchain/block-fetcher')).BlockDataFetcher(
        this.config.rpcUrl,
        process.env.STELLAR_CONTRACT_ID || 'mock-contract-id'
      );
      
      const blockData = await blockFetcher.getBlockData(blockIndex);
      const blockEntropy = blockData?.entropy?.toString('hex') || Math.random().toString(36).substring(2, 18);
      console.log(`✅ Block data retrieved: entropy=${blockEntropy.substring(0, 8)}..., timestamp=${blockData?.timestamp}`);

      // Step 2: Fetch oracle data (Block N)
      console.log('📡 Fetching oracle data...');
      const oracleData = await this.reflectorClient.fetchAllOracleData();
      console.log(`✅ Oracle data fetched: ${oracleData.oraclesAvailable}/3 sources, quality: ${oracleData.dataQuality}`);

      // Step 3: Run DAO analysis and vote submission (Block N)
      console.log('🤖 Running DAO analysis...');
      const votes = await this.daoRegistry.runAnalysis(oracleData, cycleId);
      console.log(`✅ DAO analysis complete: ${votes.length} votes collected`);

      // Step 4: Calculate weighted consensus (Block N+1)
      console.log('⚖️  Calculating weighted consensus...');
      const activeDAOs = new Map();
      this.daoRegistry.getActiveDAOs().forEach(dao => {
        activeDAOs.set(dao.id, dao);
      });

      const consensusResult = this.votingSystem.calculateConsensus(
        votes,
        activeDAOs,
        cycleId,
        { blockEntropy, cycleId }
      );

      // Step 5: Analyze and log results
      const analysis = this.votingSystem.analyzeConsensus(consensusResult);
      const processingTime = Date.now() - startTime;

      console.log(`✅ Consensus reached: ${consensusResult.finalWeather === 1 ? 'GOOD' : 'BAD'} weather`);
      console.log(`📊 ${analysis.summary}`);
      console.log(`⏱️  Processing time: ${processingTime}ms`);

      return consensusResult;
    } catch (error) {
      console.error('❌ Voting cycle failed:', error);
      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility (with explicit entropy)
   */
  async performVotingCycleWithEntropy(blockIndex: number, blockEntropy: string): Promise<ConsensusResult> {
    console.log(`⚠️  Using legacy method with explicit entropy: ${blockEntropy.substring(0, 8)}...`);
    return this.performVotingCycle(blockIndex);
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`\n🚀 DAO Oracle System started`);
        console.log(`📡 Network: ${this.config.stellarNetwork}`);
        console.log(`🌐 API Server: http://localhost:${this.config.port}`);
        console.log(`🤖 Active DAOs: ${this.daoRegistry.getActiveDAOs().length}`);
        console.log(`🔗 Oracle Sources: ${this.reflectorClient.getOracleSources().length}`);
        console.log('\n📚 API Endpoints:');
        console.log(`   POST /api/dao/calculate-votes`);
        console.log(`   GET  /api/dao/reveal-votes/:cycleId`);
        console.log(`   GET  /api/dao/performance/:daoId`);
        console.log(`   GET  /api/dao/status`);
        console.log(`   GET  /health`);
        console.log('');
        resolve();
      });
    });
  }

  /**
   * Stop the system gracefully
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping DAO Oracle System...');
    // Cleanup logic here
    console.log('✅ System stopped');
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, 'healthy' | 'unhealthy'>;
    timestamp: number;
  } {
    return {
      status: 'healthy', // TODO: Implement actual health checks
      components: {
        oracles: 'healthy',
        daos: 'healthy',
        consensus: 'healthy',
        api: 'healthy'
      },
      timestamp: Date.now()
    };
  }
}

// Example usage and configuration
export const createDAOOracleSystem = (config: Partial<SystemConfig> = {}): DAOOracleSystem => {
  const defaultConfig: SystemConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    port: 3000,
    stellarNetwork: 'testnet',
    logLevel: 'info'
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new DAOOracleSystem(finalConfig);
};

// CLI entry point for testing
if (require.main === module) {
  const system = createDAOOracleSystem({
    port: 3000,
    stellarNetwork: 'testnet',
    logLevel: 'info'
  });

  system.start().then(() => {
    console.log('System started successfully');
    
    // Example: Simulate a voting cycle every 5 minutes (using just block index)
    setInterval(async () => {
      try {
        const blockIndex = Math.floor(Date.now() / 1000); // Mock block index based on timestamp
        console.log(`\n🔄 Running scheduled test voting cycle for block ${blockIndex}`);
        await system.performVotingCycle(blockIndex);
      } catch (error) {
        console.error('Scheduled voting cycle failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }).catch(error => {
    console.error('Failed to start system:', error);
    process.exit(1);
  });
}