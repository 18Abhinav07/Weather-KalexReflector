// User Registration and Custodial Wallet Management Service
// Implements SRS REQ-001: User Registration with Custodial Wallet Creation

import { Keypair } from '@stellar/stellar-sdk';
import { db } from '../database/connection';
import { CustodialWalletManager } from './custodial-wallet-manager';
import { createHash, randomBytes } from 'crypto';

export interface UserRegistrationRequest {
  mainWalletAddress: string;
  email?: string; // Optional for notifications
}

export interface UserRegistrationResponse {
  success: boolean;
  userId?: string;
  custodialWalletAddress?: string;
  error?: string;
}

export interface UserProfile {
  userId: string;
  mainWalletAddress: string;
  custodialWalletAddress: string;
  currentState: 'active' | 'suspended' | 'closed';
  createdAt: Date;
  lastActive: Date;
}

export interface UserBalanceSummary {
  userId: string;
  custodialBalance: bigint; // KALE balance in stroops
  activePositions: number;
  totalStaked: bigint;
  totalRewards: bigint;
}

export class UserService {
  private custodialManager: CustodialWalletManager;

  constructor() {
    this.custodialManager = new CustodialWalletManager();
  }

  /**
   * Register new user with custodial wallet creation per SRS REQ-001
   */
  async registerUser(request: UserRegistrationRequest): Promise<UserRegistrationResponse> {
    try {
      // Validate Stellar address format
      if (!this.isValidStellarAddress(request.mainWalletAddress)) {
        return {
          success: false,
          error: 'Invalid Stellar wallet address format'
        };
      }

      // Check if user already exists
      const existingUser = await this.getUserByMainWallet(request.mainWalletAddress);
      if (existingUser) {
        return {
          success: false,
          error: 'User with this wallet address already exists'
        };
      }

      // Generate custodial wallet
      const custodialWallet = await this.custodialManager.generateCustodialWallet();
      
      // Register user in database transaction
      const result = await db.transaction(async (client) => {
        // Create user record
        const userResult = await client.query(`
          INSERT INTO users (main_wallet_address, custodial_wallet_address) 
          VALUES ($1, $2) 
          RETURNING user_id
        `, [request.mainWalletAddress, custodialWallet.publicKey]);

        const userId = userResult.rows[0].user_id;

        // Create custodial wallet record
        await client.query(`
          INSERT INTO custodial_wallets (wallet_address, encrypted_private_key, user_id, current_balance) 
          VALUES ($1, $2, $3, $4)
        `, [
          custodialWallet.publicKey,
          custodialWallet.encryptedPrivateKey,
          userId,
          0 // Initial balance
        ]);

        // Log registration transaction
        await client.query(`
          INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
          VALUES ($1, 'registration', $2, $3, $4)
        `, [
          userId,
          0,
          custodialWallet.publicKey,
          JSON.stringify({
            mainWallet: request.mainWalletAddress,
            registrationTimestamp: new Date().toISOString(),
            ipAddress: 'system' // Could be passed from request in production
          })
        ]);

        return { userId, custodialWalletAddress: custodialWallet.publicKey };
      });

      // Initialize wallet on Stellar network
      await this.custodialManager.initializeWalletOnNetwork(custodialWallet.publicKey);

      console.log(`[UserService] ✅ User registered successfully: ${result.userId}`);
      console.log(`[UserService] Main wallet: ${request.mainWalletAddress}`);
      console.log(`[UserService] Custodial wallet: ${result.custodialWalletAddress}`);

      return {
        success: true,
        userId: result.userId,
        custodialWalletAddress: result.custodialWalletAddress
      };

    } catch (error) {
      console.error('[UserService] Registration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  /**
   * Get user profile by user ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const result = await db.query(`
        SELECT user_id, main_wallet_address, custodial_wallet_address, 
               current_state, created_at, last_active
        FROM users 
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        mainWalletAddress: row.main_wallet_address,
        custodialWalletAddress: row.custodial_wallet_address,
        currentState: row.current_state,
        createdAt: row.created_at,
        lastActive: row.last_active
      };
    } catch (error) {
      console.error('[UserService] Failed to get user profile:', error);
      return null;
    }
  }

  /**
   * Get user by main wallet address
   */
  async getUserByMainWallet(mainWalletAddress: string): Promise<UserProfile | null> {
    try {
      const result = await db.query(`
        SELECT user_id, main_wallet_address, custodial_wallet_address, 
               current_state, created_at, last_active
        FROM users 
        WHERE main_wallet_address = $1
      `, [mainWalletAddress]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        mainWalletAddress: row.main_wallet_address,
        custodialWalletAddress: row.custodial_wallet_address,
        currentState: row.current_state,
        createdAt: row.created_at,
        lastActive: row.last_active
      };
    } catch (error) {
      console.error('[UserService] Failed to get user by main wallet:', error);
      return null;
    }
  }

  /**
   * Get user balance summary with active positions
   */
  async getUserBalanceSummary(userId: string): Promise<UserBalanceSummary | null> {
    try {
      const result = await db.query(`
        SELECT * FROM user_active_positions WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // User exists but no positions yet
        const userExists = await this.getUserProfile(userId);
        if (!userExists) return null;

        return {
          userId,
          custodialBalance: 0n,
          activePositions: 0,
          totalStaked: 0n,
          totalRewards: 0n
        };
      }

      const row = result.rows[0];
      
      // Get current custodial balance
      const balanceResult = await db.query(`
        SELECT current_balance FROM custodial_wallets 
        WHERE user_id = $1
      `, [userId]);

      const custodialBalance = BigInt(balanceResult.rows[0]?.current_balance || 0);

      return {
        userId,
        custodialBalance,
        activePositions: parseInt(row.active_positions) || 0,
        totalStaked: BigInt(row.total_staked || 0),
        totalRewards: BigInt(row.total_rewards || 0)
      };
    } catch (error) {
      console.error('[UserService] Failed to get user balance summary:', error);
      return null;
    }
  }

  /**
   * Update user status (active/suspended/closed)
   */
  async updateUserStatus(userId: string, newStatus: 'active' | 'suspended' | 'closed', reason?: string): Promise<boolean> {
    try {
      await db.transaction(async (client) => {
        // Update user status
        await client.query(`
          UPDATE users 
          SET current_state = $1, last_active = NOW() 
          WHERE user_id = $2
        `, [newStatus, userId]);

        // Log status change
        await client.query(`
          INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
          VALUES ($1, 'status_change', $2, $3, $4)
        `, [
          userId,
          0,
          'system',
          JSON.stringify({
            newStatus,
            reason: reason || 'No reason provided',
            timestamp: new Date().toISOString()
          })
        ]);
      });

      console.log(`[UserService] User status updated: ${userId} -> ${newStatus}`);
      return true;
    } catch (error) {
      console.error('[UserService] Failed to update user status:', error);
      return false;
    }
  }

  /**
   * Get custodial wallet for user
   */
  async getCustodialWallet(userId: string): Promise<{ publicKey: string; balance: bigint } | null> {
    try {
      const result = await db.query(`
        SELECT wallet_address, current_balance 
        FROM custodial_wallets 
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        publicKey: row.wallet_address,
        balance: BigInt(row.current_balance)
      };
    } catch (error) {
      console.error('[UserService] Failed to get custodial wallet:', error);
      return null;
    }
  }

  /**
   * List users for admin purposes (paginated)
   */
  async listUsers(offset: number = 0, limit: number = 50): Promise<UserProfile[]> {
    try {
      const result = await db.query(`
        SELECT user_id, main_wallet_address, custodial_wallet_address, 
               current_state, created_at, last_active
        FROM users 
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return result.rows.map((row: any) => ({
        userId: row.user_id,
        mainWalletAddress: row.main_wallet_address,
        custodialWalletAddress: row.custodial_wallet_address,
        currentState: row.current_state,
        createdAt: row.created_at,
        lastActive: row.last_active
      }));
    } catch (error) {
      console.error('[UserService] Failed to list users:', error);
      return [];
    }
  }

  /**
   * Validate Stellar address format
   */
  private isValidStellarAddress(address: string): boolean {
    // Stellar addresses start with 'G' and are 56 characters long
    const stellarAddressRegex = /^G[A-Z0-9]{55}$/;
    return stellarAddressRegex.test(address);
  }

  /**
   * Generate unique user ID (fallback if UUID fails)
   */
  private generateUserId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(6).toString('hex');
    return `user_${timestamp}_${randomPart}`;
  }

  /**
   * System health check
   */
  async healthCheck(): Promise<{ status: string; userCount: number; activeUsers: number }> {
    try {
      const totalResult = await db.query('SELECT COUNT(*) as total FROM users');
      const activeResult = await db.query(`
        SELECT COUNT(*) as active 
        FROM users 
        WHERE current_state = 'active' 
        AND last_active > NOW() - INTERVAL '24 hours'
      `);

      return {
        status: 'healthy',
        userCount: parseInt(totalResult.rows[0].total),
        activeUsers: parseInt(activeResult.rows[0].active)
      };
    } catch (error) {
      console.error('[UserService] Health check failed:', error);
      return {
        status: 'unhealthy',
        userCount: 0,
        activeUsers: 0
      };
    }
  }
}

export const userService = new UserService();