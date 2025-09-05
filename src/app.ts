// Weather Farming System - Express Application Server
// Main server implementation for SRS Phase 1 requirements

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { weatherFarmingRoutes } from './api/routes';
import { farmingAutomationEngine } from './services/farming-automation-engine';
import { depositMonitor } from './services/deposit-monitor';
import { weatherIntegrationService } from './services/weather-integration-service';
import { db } from './database/connection';

export class WeatherFarmingServer {
  private app: express.Application;
  private server: any;
  private readonly PORT = process.env.PORT || 3000;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: {
        success: false,
        error: 'Too many requests, please try again later'
      }
    });
    this.app.use('/api', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        // Check database connection
        const dbHealth = await db.query('SELECT 1 as healthy');
        
        // Check automation engine health
        const automationHealth = await farmingAutomationEngine.healthCheck();
        
        res.json({
          success: true,
          data: {
            server: 'healthy',
            database: dbHealth.rows.length > 0 ? 'healthy' : 'unhealthy',
            automation: automationHealth.status,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(503).json({
          success: false,
          error: 'Service unhealthy',
          timestamp: new Date().toISOString()
        });
      }
    });

    // API routes
    this.app.use('/api', weatherFarmingRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'KALE Weather Farming System API',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          api: '/api',
          documentation: '/api-docs'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('[Server] Unhandled error:', error);
      
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[Server] Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Start the server and background services
   */
  async start(): Promise<void> {
    try {
      console.log('[Server] Starting Weather Farming System...');

      // Initialize database connection
      console.log('[Server] Connecting to database...');
      // Database connection is handled by the db module

      // Start automation services
      console.log('[Server] Starting background services...');
      
      // Start deposit monitoring
      await depositMonitor.startMonitoring();
      console.log('[Server] ✅ Deposit monitoring started');

      // Start farming automation
      await farmingAutomationEngine.startAutomation();
      console.log('[Server] ✅ Farming automation started');

      // Start HTTP server
      this.server = this.app.listen(this.PORT, () => {
        console.log(`[Server] ✅ HTTP server listening on port ${this.PORT}`);
        console.log(`[Server] 🌾 KALE Weather Farming System ready!`);
        console.log(`[Server] API endpoints: http://localhost:${this.PORT}/api`);
        console.log(`[Server] Health check: http://localhost:${this.PORT}/health`);
      });

      // Set up periodic weather processing
      this.setupWeatherProcessing();

    } catch (error) {
      console.error('[Server] Failed to start:', error);
      process.exit(1);
    }
  }

  /**
   * Setup periodic weather outcome processing
   */
  private setupWeatherProcessing(): void {
    // Process weather outcomes every 30 seconds
    const weatherInterval = setInterval(async () => {
      try {
        // Get current block from farming automation engine
        const status = farmingAutomationEngine.getAutomationStatus();
        
        // Process any pending weather outcomes
        await weatherIntegrationService.processWeatherOutcomes(status.currentBlock);
        
      } catch (error) {
        console.error('[Server] Weather processing error:', error);
      }
    }, 30000);

    // Store interval for cleanup
    (this as any).weatherInterval = weatherInterval;
  }

  /**
   * Graceful shutdown handling
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`[Server] Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
      }

      // Stop background services
      await farmingAutomationEngine.stopAutomation();
      depositMonitor.stopMonitoring();

      // Clear intervals
      if ((this as any).weatherInterval) {
        clearInterval((this as any).weatherInterval);
      }

      // Close database connections
      await db.end();

      console.log('[Server] ✅ Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      console.error('[Server] Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get Express application instance
   */
  getApp(): express.Application {
    return this.app;
  }
}

// Create and export server instance
export const weatherFarmingServer = new WeatherFarmingServer();

// Start server if this file is run directly
if (require.main === module) {
  weatherFarmingServer.start().catch((error) => {
    console.error('[Server] Startup failed:', error);
    process.exit(1);
  });
}