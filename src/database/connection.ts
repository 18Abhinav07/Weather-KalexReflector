// Database Connection Management for KALE Weather Farming System
// Implements SRS Section 7 Data Requirements with PostgreSQL

import { Pool, type PoolConfig, Client } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

class DatabaseManager {
  private pool: Pool;
  private isInitialized = false;

  constructor(private config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 10000,
      
      // Performance optimization
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      
      // Error handling
      application_name: 'kale_weather_farming_system'
    };

    this.pool = new Pool(poolConfig);
    this.setupPoolEventHandlers();
  }

  /**
   * Setup pool event handlers for monitoring and error handling
   */
  private setupPoolEventHandlers(): void {
    this.pool.on('connect', (client) => {
      console.log(`[DB] New client connected (total: ${this.pool.totalCount})`);
    });

    this.pool.on('acquire', (client) => {
      console.log(`[DB] Client acquired from pool (idle: ${this.pool.idleCount})`);
    });

    this.pool.on('error', (err, client) => {
      console.error('[DB] Pool error:', err.message);
      console.error('[DB] Error details:', err);
    });

    this.pool.on('remove', (client) => {
      console.log(`[DB] Client removed from pool (total: ${this.pool.totalCount})`);
    });
  }

  /**
   * Initialize database schema and verify connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[DB] Database already initialized');
      return;
    }

    try {
      // Test connection
      await this.testConnection();
      console.log('[DB] ✅ Database connection successful');

      // Initialize schema if needed
      await this.initializeSchema();
      console.log('[DB] ✅ Database schema initialized');

      this.isInitialized = true;
    } catch (error) {
      console.error('[DB] ❌ Database initialization failed:', error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as db_version');
      console.log(`[DB] Connected to: ${result.rows[0].db_version}`);
      console.log(`[DB] Server time: ${result.rows[0].current_time}`);
    } finally {
      client.release();
    }
  }

  /**
   * Initialize database schema from schema.sql file
   */
  private async initializeSchema(): Promise<void> {
    try {
      // Check if tables already exist
      const tablesExist = await this.checkTablesExist();
      if (tablesExist) {
        console.log('[DB] Schema tables already exist, skipping initialization');
        return;
      }

      console.log('[DB] Creating database schema...');
      const schemaPath = join(__dirname, 'schema.sql');
      const schemaSql = await readFile(schemaPath, 'utf-8');

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(schemaSql);
        await client.query('COMMIT');
        console.log('[DB] ✅ Schema created successfully');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[DB] Schema initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if core tables exist
   */
  private async checkTablesExist(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'custodial_wallets', 'weather_cycles', 'farm_positions')
      `);
      return result.rows.length >= 4;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query with connection from pool
   */
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries (>100ms)
      if (duration > 100) {
        console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
      }
      
      return result;
    } catch (error) {
      console.error('[DB] Query error:', error);
      console.error('[DB] Query:', text);
      console.error('[DB] Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute queries in a transaction
   */
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DB] Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pool status for monitoring
   */
  getPoolStatus() {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    console.log('[DB] Closing database pool...');
    await this.pool.end();
    console.log('[DB] ✅ Database pool closed');
  }
}

// Database configuration from environment
const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kale_weather_farming',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000')
  };
};

// Singleton database manager instance
export const db = new DatabaseManager(getDatabaseConfig());

// Health check endpoint helper
export const checkDatabaseHealth = async () => {
  try {
    await db.query('SELECT 1');
    const status = db.getPoolStatus();
    return {
      status: 'healthy',
      ...status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown helper
export const closeDatabaseConnection = async () => {
  await db.close();
};