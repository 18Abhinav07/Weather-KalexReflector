// Automated Farming Transaction Engine
// Implements SRS REQ-004 (Automated Plant Execution) and REQ-005 (Automated Work Processing)

import { Keypair } from '@stellar/stellar-sdk';
import { Client as KaleClient } from 'kale-sc-sdk';
import { db } from '../database/connection';
import { plantRequestService } from './plant-request-service';
import { CustodialWalletManager } from './custodial-wallet-manager';
import { depositMonitor } from './deposit-monitor';
import { EventEmitter } from 'events';

export interface FarmingPosition {
  positionId: string;
  userId: string;
  cycleId: bigint;
  stakeAmount: bigint;
  plantBlock: bigint;
  status: 'planted' | 'worked' | 'harvested' | 'settled';
  plantTransactionHash?: string;
  workTransactionHash?: string;
  harvestTransactionHash?: string;
}

export interface AutomationStatus {
  isRunning: boolean;
  currentBlock: bigint;
  pendingPlants: number;
  pendingWork: number;
  processedToday: number;
  errorCount: number;
}

export class FarmingAutomationEngine extends EventEmitter {
  private kaleClient: KaleClient;
  private custodialManager: CustodialWalletManager;
  private isRunning = false;
  private currentBlock = 0n;
  private automationInterval: NodeJS.Timeout | null = null;
  private readonly AUTOMATION_INTERVAL = 5000; // Check every 5 seconds
  private readonly WORK_DELAY_BLOCKS = 24; // Wait 24 blocks (~2 minutes) before work
  private readonly HARVEST_DELAY_BLOCKS = 48; // Wait 48 blocks (~4 minutes) after work before harvest
  private errorCount = 0;
  private processedToday = 0;
  private readonly MAX_ERRORS = 10;

  constructor() {
    super();

    // Initialize KALE contract client
    this.kaleClient = new KaleClient({
      rpcUrl: process.env.STELLAR_RPC_URL || 'https://horizon-testnet.stellar.org',
      contractId: process.env.STELLAR_CONTRACT_ID || '',
      networkPassphrase: process.env.STELLAR_NETWORK === 'mainnet' 
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015'
    });

    this.custodialManager = new CustodialWalletManager();

    console.log('[FarmingAutomationEngine] Initialized');
    
    // Listen for plant request events
    plantRequestService.on('requestQueued', (event) => {
      console.log(`[FarmingAutomationEngine] New plant request queued for block ${event.targetBlock}`);
    });
  }

  /**
   * Start the automated farming engine
   */
  async startAutomation(): Promise<void> {
    if (this.isRunning) {
      console.log('[FarmingAutomationEngine] Automation already running');
      return;
    }

    try {
      console.log('[FarmingAutomationEngine] 🚀 Starting farming automation...');

      // Get current block from contract
      await this.updateCurrentBlock();

      // Start automation loop
      this.automationInterval = setInterval(async () => {
        try {
          await this.runAutomationCycle();
        } catch (error) {
          console.error('[FarmingAutomationEngine] Automation cycle error:', error);
          this.errorCount++;
          
          if (this.errorCount >= this.MAX_ERRORS) {
            console.error('[FarmingAutomationEngine] Too many errors, stopping automation');
            await this.stopAutomation();
          }
        }
      }, this.AUTOMATION_INTERVAL);

      this.isRunning = true;
      this.errorCount = 0;

      console.log('[FarmingAutomationEngine] ✅ Farming automation started');

    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to start automation:', error);
      throw error;
    }
  }

  /**
   * Stop the automated farming engine
   */
  async stopAutomation(): Promise<void> {
    console.log('[FarmingAutomationEngine] 🛑 Stopping farming automation...');

    if (this.automationInterval) {
      clearInterval(this.automationInterval);
      this.automationInterval = null;
    }

    this.isRunning = false;
    console.log('[FarmingAutomationEngine] ✅ Farming automation stopped');
  }

  /**
   * Main automation cycle - checks for pending plants and work
   */
  private async runAutomationCycle(): Promise<void> {
    // Update current block
    await this.updateCurrentBlock();

    // Process pending plant requests for current block
    await this.processPendingPlants();

    // Process pending work for planted positions
    await this.processPendingWork();

    // Process pending harvest for worked positions
    await this.processPendingHarvest();

    // Reset daily counter at midnight
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      this.processedToday = 0;
    }
  }

  /**
   * Process plant requests ready for execution at current block
   */
  private async processPendingPlants(): Promise<void> {
    try {
      // Get plant requests for current block
      const pendingRequests = await plantRequestService.getRequestsForBlock(this.currentBlock);
      
      if (pendingRequests.length === 0) {
        return;
      }

      console.log(`[FarmingAutomationEngine] Processing ${pendingRequests.length} plant requests for block ${this.currentBlock}`);

      // Process each request
      for (const request of pendingRequests) {
        await this.executePlantTransaction(request);
      }

    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to process pending plants:', error);
    }
  }

  /**
   * Execute individual plant transaction per SRS REQ-004
   */
  private async executePlantTransaction(request: any): Promise<void> {
    try {
      console.log(`[FarmingAutomationEngine] Executing plant: ${request.requestId} (${request.stakeAmount} KALE)`);

      // Update request status to executing
      await plantRequestService.updateRequestStatus(request.requestId, 'executing');

      // Get custodial wallet for user
      const custodialWallet = await this.getCustodialWalletForUser(request.userId);
      if (!custodialWallet) {
        throw new Error('Custodial wallet not found');
      }

      // Verify sufficient balance
      const balance = await depositMonitor.getCustodialWalletBalance(request.userId);
      if (!balance || balance < request.stakeAmount) {
        throw new Error('Insufficient balance for plant transaction');
      }

      // Prepare plant transaction using existing KALE farming logic
      const plantResult = await this.submitPlantTransaction(
        custodialWallet.keypair,
        request.stakeAmount,
        request.targetBlock
      );

      if (plantResult.success) {
        // Update custodial wallet balance (deduct stake)
        await depositMonitor.updateWalletBalance(
          request.userId,
          -BigInt(request.stakeAmount),
          'plant',
          plantResult.transactionHash
        );

        // Mark request as completed
        await plantRequestService.updateRequestStatus(
          request.requestId, 
          'completed', 
          undefined,
          plantResult.transactionHash
        );

        this.processedToday++;
        console.log(`[FarmingAutomationEngine] ✅ Plant executed: ${plantResult.transactionHash}`);

        // Emit plant executed event
        this.emit('plantExecuted', {
          requestId: request.requestId,
          userId: request.userId,
          transactionHash: plantResult.transactionHash,
          stakeAmount: request.stakeAmount,
          targetBlock: request.targetBlock
        });

      } else {
        throw new Error(plantResult.error || 'Plant transaction failed');
      }

    } catch (error) {
      console.error(`[FarmingAutomationEngine] Plant execution failed for ${request.requestId}:`, error);
      
      // Mark request as failed
      await plantRequestService.updateRequestStatus(
        request.requestId, 
        'failed', 
        error instanceof Error ? error.message : 'Plant execution failed'
      );

      // Emit plant failed event
      this.emit('plantFailed', {
        requestId: request.requestId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process work transactions for planted positions per SRS REQ-005
   */
  private async processPendingWork(): Promise<void> {
    try {
      // Get positions ready for work (planted but not worked)
      const pendingWork = await this.getPositionsReadyForWork();
      
      if (pendingWork.length === 0) {
        return;
      }

      console.log(`[FarmingAutomationEngine] Processing work for ${pendingWork.length} positions`);

      // Process each work transaction
      for (const position of pendingWork) {
        await this.executeWorkTransaction(position);
      }

    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to process pending work:', error);
    }
  }

  /**
   * Execute individual work transaction
   */
  private async executeWorkTransaction(position: FarmingPosition): Promise<void> {
    try {
      console.log(`[FarmingAutomationEngine] Executing work: ${position.positionId}`);

      // Get custodial wallet for user
      const custodialWallet = await this.getCustodialWalletForUser(position.userId);
      if (!custodialWallet) {
        throw new Error('Custodial wallet not found');
      }

      // Execute work transaction using existing KALE farming logic
      const workResult = await this.submitWorkTransaction(
        custodialWallet.keypair,
        position.plantBlock,
        position.stakeAmount
      );

      if (workResult.success) {
        // Update farm position status
        await db.query(`
          UPDATE farm_positions
          SET status = 'worked', 
              work_transaction_hash = $1
          WHERE position_id = $2
        `, [workResult.transactionHash, position.positionId]);

        console.log(`[FarmingAutomationEngine] ✅ Work executed: ${workResult.transactionHash}`);

        // Emit work executed event
        this.emit('workExecuted', {
          positionId: position.positionId,
          userId: position.userId,
          transactionHash: workResult.transactionHash,
          plantBlock: position.plantBlock
        });

      } else {
        throw new Error(workResult.error || 'Work transaction failed');
      }

    } catch (error) {
      console.error(`[FarmingAutomationEngine] Work execution failed for ${position.positionId}:`, error);
      
      // Log error but don't fail the position - will retry next cycle
      await db.query(`
        INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        position.userId,
        'work_error',
        0,
        'system',
        JSON.stringify({
          positionId: position.positionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      ]);
    }
  }

  /**
   * Process harvest transactions for worked positions per SRS REQ-007
   */
  private async processPendingHarvest(): Promise<void> {
    try {
      // Get positions ready for harvest (worked but not harvested)
      const pendingHarvest = await this.getPositionsReadyForHarvest();
      
      if (pendingHarvest.length === 0) {
        return;
      }

      console.log(`[FarmingAutomationEngine] Processing harvest for ${pendingHarvest.length} positions`);

      // Process each harvest transaction
      for (const position of pendingHarvest) {
        await this.executeHarvestTransaction(position);
      }

    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to process pending harvest:', error);
    }
  }

  /**
   * Execute individual harvest transaction
   */
  private async executeHarvestTransaction(position: FarmingPosition): Promise<void> {
    try {
      console.log(`[FarmingAutomationEngine] Executing harvest: ${position.positionId}`);

      // Get custodial wallet for user
      const custodialWallet = await this.getCustodialWalletForUser(position.userId);
      if (!custodialWallet) {
        throw new Error('Custodial wallet not found');
      }

      // Execute harvest transaction using existing KALE farming logic
      const harvestResult = await this.submitHarvestTransaction(
        custodialWallet.keypair,
        position.plantBlock,
        position.stakeAmount
      );

      if (harvestResult.success) {
        // Update farm position status and base reward
        const baseReward = harvestResult.reward || position.stakeAmount;
        await db.query(`
          UPDATE farm_positions
          SET status = 'harvested', 
              harvest_transaction_hash = $1,
              base_reward = $2
          WHERE position_id = $3
        `, [harvestResult.transactionHash, baseReward, position.positionId]);

        console.log(`[FarmingAutomationEngine] ✅ Harvest executed: ${harvestResult.transactionHash}`);

        // Emit harvest executed event
        this.emit('harvestExecuted', {
          positionId: position.positionId,
          userId: position.userId,
          transactionHash: harvestResult.transactionHash,
          plantBlock: position.plantBlock,
          baseReward
        });

      } else {
        throw new Error(harvestResult.error || 'Harvest transaction failed');
      }

    } catch (error) {
      console.error(`[FarmingAutomationEngine] Harvest execution failed for ${position.positionId}:`, error);
      
      // Log error but don't fail the position - will retry next cycle
      await db.query(`
        INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        position.userId,
        'harvest_error',
        0,
        'system',
        JSON.stringify({
          positionId: position.positionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      ]);
    }
  }

  /**
   * Submit plant transaction to KALE contract
   */
  private async submitPlantTransaction(
    keypair: Keypair, 
    stakeAmount: bigint, 
    targetBlock: bigint
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      // Convert stake amount to KALE contract format
      const stakeAmountForContract = stakeAmount; // Already in stroops

      // Use KALE contract to plant
      const result = await this.kaleClient.plant({
        farmer: keypair.publicKey(),
        amount: stakeAmountForContract
      }, {
        fee: 10000000, // 1 XLM fee
        timeoutInSeconds: 30
      });

      // Sign and submit transaction
      result.sign(keypair);
      const signedTx = await result.send();

      return {
        success: true,
        transactionHash: signedTx.hash || 'unknown'
      };

    } catch (error) {
      console.error('[FarmingAutomationEngine] Plant transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Plant transaction failed'
      };
    }
  }

  /**
   * Submit work transaction to KALE contract
   */
  private async submitWorkTransaction(
    keypair: Keypair,
    plantBlock: bigint,
    stakeAmount: bigint
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      // Calculate hash for work (simplified - in production use actual mining)
      const workHash = this.calculateWorkHash(keypair.publicKey(), plantBlock, stakeAmount);

      // Use KALE contract to submit work
      const result = await this.kaleClient.work({
        farmer: keypair.publicKey(),
        hash: workHash.hash,
        nonce: workHash.nonce
      }, {
        fee: 10000000, // 1 XLM fee
        timeoutInSeconds: 30
      });

      // Sign and submit transaction
      result.sign(keypair);
      const signedTx = await result.send();

      return {
        success: true,
        transactionHash: signedTx.hash || 'unknown'
      };

    } catch (error) {
      console.error('[FarmingAutomationEngine] Work transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Work transaction failed'
      };
    }
  }

  /**
   * Submit harvest transaction to KALE contract
   */
  private async submitHarvestTransaction(
    keypair: Keypair,
    plantBlock: bigint,
    stakeAmount: bigint
  ): Promise<{ success: boolean; transactionHash?: string; reward?: bigint; error?: string }> {
    try {
      // Use KALE contract to harvest
      const result = await this.kaleClient.harvest({
        farmer: keypair.publicKey(),
        index: 0
      }, {
        fee: 10000000, // 1 XLM fee
        timeoutInSeconds: 30
      });

      // Sign and submit transaction
      result.sign(keypair);
      const signedTx = await result.send();

      // Get harvest reward from contract (simplified - actual implementation would parse result)
      const harvestReward = stakeAmount + BigInt(Math.floor(Number(stakeAmount) * 0.1)); // Base 10% reward

      return {
        success: true,
        transactionHash: signedTx.hash || 'unknown',
        reward: harvestReward
      };

    } catch (error) {
      console.error('[FarmingAutomationEngine] Harvest transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Harvest transaction failed'
      };
    }
  }

  /**
   * Get custodial wallet keypair for user
   */
  private async getCustodialWalletForUser(userId: string): Promise<{ keypair: Keypair } | null> {
    try {
      const result = await db.query(`
        SELECT wallet_address, encrypted_private_key
        FROM custodial_wallets
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const { wallet_address, encrypted_private_key } = result.rows[0];
      
      // Decrypt private key
      const decryptedKey = await this.custodialManager.decryptPrivateKey(encrypted_private_key);
      const keypair = Keypair.fromSecret(decryptedKey);

      return { keypair };
    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to get custodial wallet:', error);
      return null;
    }
  }

  /**
   * Get positions ready for work
   */
  private async getPositionsReadyForWork(): Promise<FarmingPosition[]> {
    try {
      // Get positions planted at least WORK_DELAY_BLOCKS ago
      const workReadyBlock = this.currentBlock - BigInt(this.WORK_DELAY_BLOCKS);

      const result = await db.query(`
        SELECT position_id, user_id, cycle_id, stake_amount, plant_block,
               status, plant_transaction_hash, work_transaction_hash, harvest_transaction_hash
        FROM farm_positions
        WHERE status = 'planted' 
        AND plant_block <= $1
        ORDER BY plant_block ASC
        LIMIT 50
      `, [workReadyBlock]);

      return result.rows.map((row: any) => ({
        positionId: row.position_id,
        userId: row.user_id,
        cycleId: BigInt(row.cycle_id),
        stakeAmount: BigInt(row.stake_amount),
        plantBlock: BigInt(row.plant_block),
        status: row.status,
        plantTransactionHash: row.plant_transaction_hash,
        workTransactionHash: row.work_transaction_hash,
        harvestTransactionHash: row.harvest_transaction_hash
      }));
    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to get positions ready for work:', error);
      return [];
    }
  }

  /**
   * Get positions ready for harvest
   */
  private async getPositionsReadyForHarvest(): Promise<FarmingPosition[]> {
    try {
      // Get positions worked at least HARVEST_DELAY_BLOCKS ago
      const harvestReadyBlock = this.currentBlock - BigInt(this.HARVEST_DELAY_BLOCKS);

      const result = await db.query(`
        SELECT fp.position_id, fp.user_id, fp.cycle_id, fp.stake_amount, fp.plant_block,
               fp.status, fp.plant_transaction_hash, fp.work_transaction_hash, fp.harvest_transaction_hash,
               wc.current_state as cycle_state
        FROM farm_positions fp
        JOIN weather_cycles wc ON fp.cycle_id = wc.cycle_id
        WHERE fp.status = 'worked' 
        AND fp.plant_block <= $1
        AND wc.current_state = 'completed'
        ORDER BY fp.plant_block ASC
        LIMIT 50
      `, [harvestReadyBlock]);

      return result.rows.map((row: any) => ({
        positionId: row.position_id,
        userId: row.user_id,
        cycleId: BigInt(row.cycle_id),
        stakeAmount: BigInt(row.stake_amount),
        plantBlock: BigInt(row.plant_block),
        status: row.status,
        plantTransactionHash: row.plant_transaction_hash,
        workTransactionHash: row.work_transaction_hash,
        harvestTransactionHash: row.harvest_transaction_hash
      }));
    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to get positions ready for harvest:', error);
      return [];
    }
  }

  /**
   * Update current block from contract
   */
  private async updateCurrentBlock(): Promise<void> {
    try {
      // Get current block from KALE contract - simplified for now
      // TODO: Implement proper contract method call
      this.currentBlock = BigInt(Date.now());
    } catch (error) {
      console.error('[FarmingAutomationEngine] Failed to update current block:', error);
      // Keep using last known block
    }
  }

  /**
   * Calculate work hash (simplified for automation)
   */
  private calculateWorkHash(farmerPublicKey: string, plantBlock: bigint, stakeAmount: bigint): { hash: Buffer; nonce: bigint } {
    // Simplified work hash calculation
    // In production, this would use actual mining algorithms
    const seed = farmerPublicKey + plantBlock.toString() + stakeAmount.toString();
    const hash = require('crypto').createHash('sha256').update(seed).digest();
    
    return {
      hash: hash,
      nonce: BigInt(Math.floor(Math.random() * 1000000))
    };
  }

  /**
   * Get automation status
   */
  getAutomationStatus(): AutomationStatus {
    return {
      isRunning: this.isRunning,
      currentBlock: this.currentBlock,
      pendingPlants: 0, // Would be calculated from pending requests
      pendingWork: 0,   // Would be calculated from pending work
      processedToday: this.processedToday,
      errorCount: this.errorCount
    };
  }

  /**
   * Health check for automation engine
   */
  async healthCheck(): Promise<{ status: string; currentBlock: bigint; errorCount: number; isRunning: boolean }> {
    try {
      await this.updateCurrentBlock();
      return {
        status: this.errorCount < this.MAX_ERRORS ? 'healthy' : 'degraded',
        currentBlock: this.currentBlock,
        errorCount: this.errorCount,
        isRunning: this.isRunning
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        currentBlock: this.currentBlock,
        errorCount: this.errorCount,
        isRunning: this.isRunning
      };
    }
  }
}

export const farmingAutomationEngine = new FarmingAutomationEngine();