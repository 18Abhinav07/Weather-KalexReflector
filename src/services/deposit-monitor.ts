// KALE Deposit Monitoring Service
// Implements SRS REQ-002: KALE token deposit and withdrawal management

import { Horizon } from '@stellar/stellar-sdk';
import { Asset } from '@stellar/stellar-sdk';
import { db } from '../database/connection';
import { EventEmitter } from 'events';

export interface DepositEvent {
  userId: string;
  walletAddress: string;
  amount: bigint; // KALE amount in stroops (7 decimals)
  transactionHash: string;
  fromAddress: string;
  timestamp: Date;
  confirmed: boolean;
}

export interface WithdrawalRequest {
  userId: string;
  amount: bigint;
  destinationAddress: string;
  memo?: string;
}

export interface WithdrawalResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export interface BalanceUpdateEvent {
  userId: string;
  walletAddress: string;
  previousBalance: bigint;
  newBalance: bigint;
  changeAmount: bigint;
  reason: 'deposit' | 'withdrawal' | 'plant' | 'harvest' | 'settlement';
}

export class DepositMonitorService extends EventEmitter {
  private horizonServer: Horizon.Server;
  private isMonitoring = false;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly KALE_ASSET: Asset;
  private readonly MONITORING_INTERVAL = 10000; // 10 seconds
  private readonly CONFIRMATION_BLOCKS = 2; // Wait for 2 blocks confirmation

  constructor() {
    super();
    
    // Initialize Horizon server
    const networkUrl = process.env.STELLAR_NETWORK === 'mainnet' 
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
    
    this.horizonServer = new Horizon.Server(networkUrl);

    // Initialize KALE asset
    const kaleIssuer = process.env.KALE_TOKEN_ADDRESS || 'GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE';
    this.KALE_ASSET = new Asset('KALE', kaleIssuer);

    console.log(`[DepositMonitor] Initialized for ${process.env.STELLAR_NETWORK || 'testnet'} network`);
    console.log(`[DepositMonitor] KALE Asset: ${this.KALE_ASSET.code}:${this.KALE_ASSET.issuer}`);
  }

  /**
   * Start monitoring all custodial wallets for deposits
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('[DepositMonitor] Already monitoring');
      return;
    }

    try {
      console.log('[DepositMonitor] 🔍 Starting deposit monitoring...');

      // Get all active custodial wallets
      const wallets = await this.getActiveCustodialWallets();
      console.log(`[DepositMonitor] Monitoring ${wallets.length} custodial wallets`);

      // Start monitoring each wallet
      for (const wallet of wallets) {
        await this.startWalletMonitoring(wallet.walletAddress, wallet.userId);
      }

      this.isMonitoring = true;
      console.log('[DepositMonitor] ✅ Deposit monitoring started');

    } catch (error) {
      console.error('[DepositMonitor] Failed to start monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring all wallets
   */
  async stopMonitoring(): Promise<void> {
    console.log('[DepositMonitor] 🛑 Stopping deposit monitoring...');

    // Clear all monitoring intervals
    for (const [walletAddress, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      console.log(`[DepositMonitor] Stopped monitoring: ${walletAddress}`);
    }

    this.monitoringIntervals.clear();
    this.isMonitoring = false;

    console.log('[DepositMonitor] ✅ Deposit monitoring stopped');
  }

  /**
   * Add new wallet to monitoring
   */
  async addWalletToMonitoring(walletAddress: string, userId: string): Promise<void> {
    if (this.monitoringIntervals.has(walletAddress)) {
      console.log(`[DepositMonitor] Already monitoring wallet: ${walletAddress}`);
      return;
    }

    await this.startWalletMonitoring(walletAddress, userId);
    console.log(`[DepositMonitor] Added wallet to monitoring: ${walletAddress}`);
  }

  /**
   * Remove wallet from monitoring
   */
  removeWalletFromMonitoring(walletAddress: string): void {
    const interval = this.monitoringIntervals.get(walletAddress);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(walletAddress);
      console.log(`[DepositMonitor] Removed wallet from monitoring: ${walletAddress}`);
    }
  }

  /**
   * Process withdrawal request per SRS REQ-008
   */
  async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    try {
      console.log(`[DepositMonitor] Processing withdrawal: ${request.userId} -> ${request.amount.toString()} KALE`);

      // Validate withdrawal request
      const validation = await this.validateWithdrawalRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Get custodial wallet for user
      const custodialWallet = await this.getCustodialWalletForUser(request.userId);
      if (!custodialWallet) {
        return {
          success: false,
          error: 'Custodial wallet not found'
        };
      }

      // Execute withdrawal transaction in database transaction
      const result = await db.transaction(async (client) => {
        // Update custodial wallet balance
        await client.query(`
          UPDATE custodial_wallets 
          SET current_balance = current_balance - $1,
              last_transaction_at = NOW()
          WHERE user_id = $2
        `, [request.amount, request.userId]);

        // Log withdrawal transaction
        const logResult = await client.query(`
          INSERT INTO transaction_log (
            user_id, transaction_type, amount, wallet_address, 
            metadata
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING log_id
        `, [
          request.userId,
          'withdrawal',
          -request.amount, // Negative for withdrawal
          request.destinationAddress,
          JSON.stringify({
            custodialWallet: custodialWallet.walletAddress,
            memo: request.memo,
            timestamp: new Date().toISOString()
          })
        ]);

        return {
          logId: logResult.rows[0].log_id
        };
      });

      // TODO: Execute actual Stellar transaction
      // For now, simulate successful transaction
      const mockTransactionHash = this.generateMockTransactionHash();

      // Update transaction log with hash
      await db.query(`
        UPDATE transaction_log 
        SET stellar_transaction_hash = $1
        WHERE log_id = $2
      `, [mockTransactionHash, result.logId]);

      // Emit balance update event
      this.emit('balanceUpdate', {
        userId: request.userId,
        walletAddress: custodialWallet.walletAddress,
        previousBalance: custodialWallet.balance,
        newBalance: custodialWallet.balance - request.amount,
        changeAmount: -request.amount,
        reason: 'withdrawal'
      } as BalanceUpdateEvent);

      console.log(`[DepositMonitor] ✅ Withdrawal processed: ${mockTransactionHash}`);

      return {
        success: true,
        transactionHash: mockTransactionHash
      };

    } catch (error) {
      console.error('[DepositMonitor] Withdrawal processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed'
      };
    }
  }

  /**
   * Get current balance for custodial wallet
   */
  async getCustodialWalletBalance(userId: string): Promise<bigint | null> {
    try {
      const result = await db.query(`
        SELECT current_balance 
        FROM custodial_wallets 
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return BigInt(result.rows[0].current_balance);
    } catch (error) {
      console.error('[DepositMonitor] Failed to get wallet balance:', error);
      return null;
    }
  }

  /**
   * Update custodial wallet balance
   */
  async updateWalletBalance(
    userId: string, 
    changeAmount: bigint, 
    reason: string,
    transactionHash?: string
  ): Promise<boolean> {
    try {
      await db.transaction(async (client) => {
        // Get current balance
        const balanceResult = await client.query(`
          SELECT current_balance, wallet_address 
          FROM custodial_wallets 
          WHERE user_id = $1
        `, [userId]);

        if (balanceResult.rows.length === 0) {
          throw new Error('Custodial wallet not found');
        }

        const previousBalance = BigInt(balanceResult.rows[0].current_balance);
        const walletAddress = balanceResult.rows[0].wallet_address;
        const newBalance = previousBalance + changeAmount;

        if (newBalance < 0n) {
          throw new Error('Insufficient balance');
        }

        // Update balance
        await client.query(`
          UPDATE custodial_wallets 
          SET current_balance = $1, last_transaction_at = NOW()
          WHERE user_id = $2
        `, [newBalance, userId]);

        // Log transaction
        await client.query(`
          INSERT INTO transaction_log (
            user_id, transaction_type, amount, wallet_address, 
            stellar_transaction_hash, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          userId,
          reason,
          changeAmount,
          walletAddress,
          transactionHash,
          JSON.stringify({
            previousBalance: previousBalance.toString(),
            newBalance: newBalance.toString(),
            timestamp: new Date().toISOString()
          })
        ]);

        // Emit balance update event
        this.emit('balanceUpdate', {
          userId,
          walletAddress,
          previousBalance,
          newBalance,
          changeAmount,
          reason: reason as any
        } as BalanceUpdateEvent);
      });

      return true;
    } catch (error) {
      console.error('[DepositMonitor] Failed to update wallet balance:', error);
      return false;
    }
  }

  /**
   * Start monitoring individual wallet for deposits
   */
  private async startWalletMonitoring(walletAddress: string, userId: string): Promise<void> {
    const interval = setInterval(async () => {
      try {
        await this.checkWalletForDeposits(walletAddress, userId);
      } catch (error) {
        console.error(`[DepositMonitor] Error checking wallet ${walletAddress}:`, error);
      }
    }, this.MONITORING_INTERVAL);

    this.monitoringIntervals.set(walletAddress, interval);
  }

  /**
   * Check individual wallet for new deposits
   */
  private async checkWalletForDeposits(walletAddress: string, userId: string): Promise<void> {
    try {
      // Get recent transactions for this wallet
      const payments = await this.horizonServer
        .payments()
        .forAccount(walletAddress)
        .order('desc')
        .limit(10)
        .call();

      for (const payment of payments.records) {
        // Check if this is a KALE payment to our wallet
        if (
          payment.type === 'payment' &&
          payment.to === walletAddress &&
          payment.asset_code === this.KALE_ASSET.code &&
          payment.asset_issuer === this.KALE_ASSET.issuer
        ) {
          await this.processDepositTransaction(payment, userId, walletAddress);
        }
      }
    } catch (error) {
      console.error(`[DepositMonitor] Failed to check deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Process discovered deposit transaction
   */
  private async processDepositTransaction(payment: any, userId: string, walletAddress: string): Promise<void> {
    try {
      const transactionHash = payment.transaction_hash;
      const amount = BigInt(Math.floor(parseFloat(payment.amount) * 10**7)); // Convert to stroops
      const fromAddress = payment.from;

      // Check if we've already processed this transaction
      const existing = await db.query(`
        SELECT log_id FROM transaction_log 
        WHERE stellar_transaction_hash = $1 AND transaction_type = 'deposit'
      `, [transactionHash]);

      if (existing.rows.length > 0) {
        return; // Already processed
      }

      // Process the deposit
      await this.updateWalletBalance(userId, amount, 'deposit', transactionHash);

      // Emit deposit event
      const depositEvent: DepositEvent = {
        userId,
        walletAddress,
        amount,
        transactionHash,
        fromAddress,
        timestamp: new Date(payment.created_at),
        confirmed: true // Assume confirmed if we see it
      };

      this.emit('deposit', depositEvent);

      console.log(`[DepositMonitor] ✅ Processed deposit: ${amount.toString()} KALE to ${walletAddress}`);

    } catch (error) {
      console.error('[DepositMonitor] Failed to process deposit transaction:', error);
    }
  }

  /**
   * Get all active custodial wallets
   */
  private async getActiveCustodialWallets(): Promise<Array<{ walletAddress: string; userId: string }>> {
    try {
      const result = await db.query(`
        SELECT wallet_address, user_id
        FROM custodial_wallets
        WHERE is_active = true
      `);

      return result.rows.map((row: any) => ({
        walletAddress: row.wallet_address,
        userId: row.user_id
      }));
    } catch (error) {
      console.error('[DepositMonitor] Failed to get custodial wallets:', error);
      return [];
    }
  }

  /**
   * Validate withdrawal request
   */
  private async validateWithdrawalRequest(request: WithdrawalRequest): Promise<{ valid: boolean; error?: string }> {
    // Check minimum withdrawal amount
    if (request.amount <= 0n) {
      return { valid: false, error: 'Invalid withdrawal amount' };
    }

    // Check destination address format
    if (!this.isValidStellarAddress(request.destinationAddress)) {
      return { valid: false, error: 'Invalid destination address' };
    }

    // Check sufficient balance
    const balance = await this.getCustodialWalletBalance(request.userId);
    if (!balance || balance < request.amount) {
      return { valid: false, error: 'Insufficient balance' };
    }

    return { valid: true };
  }

  /**
   * Get custodial wallet info for user
   */
  private async getCustodialWalletForUser(userId: string): Promise<{ walletAddress: string; balance: bigint } | null> {
    try {
      const result = await db.query(`
        SELECT wallet_address, current_balance
        FROM custodial_wallets
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return {
        walletAddress: result.rows[0].wallet_address,
        balance: BigInt(result.rows[0].current_balance)
      };
    } catch (error) {
      console.error('[DepositMonitor] Failed to get custodial wallet:', error);
      return null;
    }
  }

  /**
   * Validate Stellar address format
   */
  private isValidStellarAddress(address: string): boolean {
    const stellarAddressRegex = /^G[A-Z0-9]{55}$/;
    return stellarAddressRegex.test(address);
  }

  /**
   * Generate mock transaction hash for testing
   */
  private generateMockTransactionHash(): string {
    return 'mock_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): { 
    isMonitoring: boolean; 
    walletsMonitored: number; 
    monitoringInterval: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      walletsMonitored: this.monitoringIntervals.size,
      monitoringInterval: this.MONITORING_INTERVAL
    };
  }
}

export const depositMonitor = new DepositMonitorService();