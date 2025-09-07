// Plant Request Service - Implements SRS REQ-003
// User plant request validation and queueing system

import { db } from '../database/connection';
import { EventEmitter } from 'events';

export interface PlantRequest {
  userId: string;
  cycleId: bigint;
  stakeAmount: bigint; // KALE amount in stroops (7 decimals)
  targetBlock: bigint;
  memo?: string;
}

export interface PlantRequestResponse {
  success: boolean;
  requestId?: string;
  error?: string;
  estimatedExecutionTime?: Date;
}

export interface QueuedPlantRequest {
  requestId: string;
  userId: string;
  cycleId: bigint;
  stakeAmount: bigint;
  targetBlock: bigint;
  status: 'queued' | 'executing' | 'completed' | 'failed';
  submittedAt: Date;
  executedAt?: Date;
  errorMessage?: string;
}

export interface WeatherCycleInfo {
  cycleId: bigint;
  startBlock: bigint;
  endBlock: bigint;
  currentState: 'active' | 'completed' | 'settled';
  participantCount: number;
  totalStake: bigint;
}

export class PlantRequestService extends EventEmitter {
  private readonly MIN_STAKE_AMOUNT = 1000000n; // 0.1 KALE minimum stake
  private readonly MAX_STAKE_AMOUNT = 10000000000n; // 1000 KALE maximum stake per request
  private readonly CYCLE_BLOCK_COUNT = 10; // 10 blocks per weather cycle

  constructor() {
    super();
    console.log('[PlantRequestService] Initialized');
  }

  /**
   * Submit plant request per SRS REQ-003
   */
  async submitPlantRequest(request: PlantRequest): Promise<PlantRequestResponse> {
    try {
      console.log(`[PlantRequestService] Processing plant request: ${request.userId} -> Block ${request.targetBlock}`);

      // Validate request parameters
      const validation = await this.validatePlantRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Check for duplicate requests
      const duplicate = await this.checkDuplicateRequest(request.userId, request.cycleId, request.targetBlock);
      if (duplicate) {
        return {
          success: false,
          error: 'Plant request already exists for this block and cycle'
        };
      }

      // Queue the request
      const result = await db.transaction(async (client) => {
        // Insert plant request
        const requestResult = await client.query(`
          INSERT INTO plant_requests (user_id, cycle_id, stake_amount, target_block, status)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING request_id, submitted_at
        `, [request.userId, request.cycleId, request.stakeAmount, request.targetBlock, 'queued']);

        const requestId = requestResult.rows[0].request_id;
        const submittedAt = requestResult.rows[0].submitted_at;

        // Update cycle participant count
        await client.query(`
          UPDATE weather_cycles 
          SET total_participants = total_participants + 1,
              total_stake_amount = total_stake_amount + $1
          WHERE cycle_id = $2
        `, [request.stakeAmount, request.cycleId]);

        // Log the request
        await client.query(`
          INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          request.userId,
          'plant_request',
          request.stakeAmount,
          'system',
          JSON.stringify({
            requestId,
            cycleId: request.cycleId.toString(),
            targetBlock: request.targetBlock.toString(),
            memo: request.memo,
            timestamp: submittedAt
          })
        ]);

        return { requestId, submittedAt };
      });

      // Calculate estimated execution time (target block time)
      const estimatedExecutionTime = this.calculateBlockTime(request.targetBlock);

      // Emit request queued event
      this.emit('requestQueued', {
        requestId: result.requestId,
        userId: request.userId,
        targetBlock: request.targetBlock,
        stakeAmount: request.stakeAmount
      });

      console.log(`[PlantRequestService] ✅ Plant request queued: ${result.requestId}`);

      return {
        success: true,
        requestId: result.requestId,
        estimatedExecutionTime
      };

    } catch (error) {
      console.error('[PlantRequestService] Failed to submit plant request:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request submission failed'
      };
    }
  }

  /**
   * Get queued requests ready for execution at target block
   */
  async getRequestsForBlock(blockNumber: bigint): Promise<QueuedPlantRequest[]> {
    try {
      const result = await db.query(`
        SELECT request_id, user_id, cycle_id, stake_amount, target_block, 
               status, submitted_at, executed_at, error_message
        FROM plant_requests
        WHERE target_block = $1 AND status = 'queued'
        ORDER BY submitted_at ASC
      `, [blockNumber]);

      return result.rows.map((row: any) => ({
        requestId: row.request_id,
        userId: row.user_id,
        cycleId: BigInt(row.cycle_id),
        stakeAmount: BigInt(row.stake_amount),
        targetBlock: BigInt(row.target_block),
        status: row.status,
        submittedAt: row.submitted_at,
        executedAt: row.executed_at,
        errorMessage: row.error_message
      }));
    } catch (error) {
      console.error('[PlantRequestService] Failed to get requests for block:', error);
      return [];
    }
  }

  /**
   * Update request status during execution
   */
  async updateRequestStatus(
    requestId: string, 
    newStatus: 'executing' | 'completed' | 'failed',
    errorMessage?: string,
    transactionHash?: string
  ): Promise<boolean> {
    try {
      await db.transaction(async (client) => {
        const updateFields = ['status = $2'];
        const updateValues = [requestId, newStatus];
        let paramIndex = 3;

        if (newStatus === 'completed' || newStatus === 'failed') {
          updateFields.push(`executed_at = NOW()`);
        }

        if (errorMessage) {
          updateFields.push(`error_message = $${paramIndex}`);
          updateValues.push(errorMessage);
          paramIndex++;
        }

        // Update plant request
        await client.query(`
          UPDATE plant_requests 
          SET ${updateFields.join(', ')}
          WHERE request_id = $1
        `, updateValues);

        // If completed, create farm position
        if (newStatus === 'completed') {
          const requestData = await client.query(`
            SELECT user_id, cycle_id, stake_amount, target_block
            FROM plant_requests WHERE request_id = $1
          `, [requestId]);

          if (requestData.rows.length > 0) {
            const req = requestData.rows[0];
            
            await client.query(`
              INSERT INTO farm_positions (
                user_id, cycle_id, stake_amount, plant_block, 
                plant_transaction_hash, status
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              req.user_id,
              req.cycle_id,
              req.stake_amount,
              req.target_block,
              transactionHash,
              'planted'
            ]);
          }
        }
      });

      // Emit status update event
      this.emit('requestStatusUpdate', {
        requestId,
        newStatus,
        errorMessage,
        transactionHash
      });

      return true;
    } catch (error) {
      console.error('[PlantRequestService] Failed to update request status:', error);
      return false;
    }
  }

  /**
   * Get user's plant requests with status
   */
  async getUserPlantRequests(userId: string, limit: number = 50): Promise<QueuedPlantRequest[]> {
    try {
      const result = await db.query(`
        SELECT request_id, user_id, cycle_id, stake_amount, target_block,
               status, submitted_at, executed_at, error_message
        FROM plant_requests
        WHERE user_id = $1
        ORDER BY submitted_at DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map((row: any) => ({
        requestId: row.request_id,
        userId: row.user_id,
        cycleId: BigInt(row.cycle_id),
        stakeAmount: BigInt(row.stake_amount),
        targetBlock: BigInt(row.target_block),
        status: row.status,
        submittedAt: row.submitted_at,
        executedAt: row.executed_at,
        errorMessage: row.error_message
      }));
    } catch (error) {
      console.error('[PlantRequestService] Failed to get user plant requests:', error);
      return [];
    }
  }

  /**
   * Create new weather cycle
   */
  async createWeatherCycle(startBlock: bigint): Promise<WeatherCycleInfo | null> {
    try {
      const cycleId = startBlock; // Use start block as cycle ID
      const endBlock = startBlock + BigInt(this.CYCLE_BLOCK_COUNT - 1);

      const result = await db.query(`
        INSERT INTO weather_cycles (cycle_id, start_block, end_block, current_state)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cycle_id) DO NOTHING
        RETURNING cycle_id, start_block, end_block, current_state, total_participants, total_stake_amount
      `, [cycleId, startBlock, endBlock, 'active']);

      if (result.rows.length === 0) {
        // Cycle already exists, return existing
        const existing = await db.query(`
          SELECT cycle_id, start_block, end_block, current_state, total_participants, total_stake_amount
          FROM weather_cycles WHERE cycle_id = $1
        `, [cycleId]);
        
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          return {
            cycleId: BigInt(row.cycle_id),
            startBlock: BigInt(row.start_block),
            endBlock: BigInt(row.end_block),
            currentState: row.current_state,
            participantCount: parseInt(row.total_participants),
            totalStake: BigInt(row.total_stake_amount)
          };
        }
        return null;
      }

      const row = result.rows[0];
      const cycleInfo: WeatherCycleInfo = {
        cycleId: BigInt(row.cycle_id),
        startBlock: BigInt(row.start_block),
        endBlock: BigInt(row.end_block),
        currentState: row.current_state,
        participantCount: parseInt(row.total_participants),
        totalStake: BigInt(row.total_stake_amount)
      };

      console.log(`[PlantRequestService] ✅ Weather cycle created: ${cycleId} (blocks ${startBlock}-${endBlock})`);
      
      // Emit cycle created event
      this.emit('cycleCreated', cycleInfo);

      return cycleInfo;
    } catch (error) {
      console.error('[PlantRequestService] Failed to create weather cycle:', error);
      return null;
    }
  }

  /**
   * Get active weather cycles
   */
  async getActiveWeatherCycles(): Promise<WeatherCycleInfo[]> {
    try {
      const result = await db.query(`
        SELECT cycle_id, start_block, end_block, current_state, total_participants, total_stake_amount
        FROM weather_cycles
        WHERE current_state = 'active'
        ORDER BY start_block ASC
      `);

      return result.rows.map((row: any) => ({
        cycleId: BigInt(row.cycle_id),
        startBlock: BigInt(row.start_block),
        endBlock: BigInt(row.end_block),
        currentState: row.current_state,
        participantCount: parseInt(row.total_participants),
        totalStake: BigInt(row.total_stake_amount)
      }));
    } catch (error) {
      console.error('[PlantRequestService] Failed to get active cycles:', error);
      return [];
    }
  }

  /**
   * Cancel queued plant request
   */
  async cancelPlantRequest(requestId: string, userId: string): Promise<boolean> {
    try {
      const result = await db.transaction(async (client) => {
        // Check if request belongs to user and is cancellable
        const checkResult = await client.query(`
          SELECT cycle_id, stake_amount, status
          FROM plant_requests
          WHERE request_id = $1 AND user_id = $2 AND status = 'queued'
        `, [requestId, userId]);

        if (checkResult.rows.length === 0) {
          throw new Error('Request not found or not cancellable');
        }

        const { cycle_id, stake_amount } = checkResult.rows[0];

        // Update request status
        await client.query(`
          UPDATE plant_requests
          SET status = 'cancelled', executed_at = NOW()
          WHERE request_id = $1
        `, [requestId]);

        // Update cycle stats
        await client.query(`
          UPDATE weather_cycles
          SET total_participants = total_participants - 1,
              total_stake_amount = total_stake_amount - $1
          WHERE cycle_id = $2
        `, [stake_amount, cycle_id]);

        // Log cancellation
        await client.query(`
          INSERT INTO transaction_log (user_id, transaction_type, amount, wallet_address, metadata)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          userId,
          'plant_cancellation',
          0,
          'system',
          JSON.stringify({
            requestId,
            cancelledAt: new Date().toISOString(),
            stakeAmount: stake_amount.toString()
          })
        ]);

        return true;
      });

      console.log(`[PlantRequestService] ✅ Plant request cancelled: ${requestId}`);
      return result;
    } catch (error) {
      console.error('[PlantRequestService] Failed to cancel plant request:', error);
      return false;
    }
  }

  /**
   * Validate plant request per SRS requirements
   */
  private async validatePlantRequest(request: PlantRequest): Promise<{ valid: boolean; error?: string }> {
    // Validate stake amount
    if (request.stakeAmount < this.MIN_STAKE_AMOUNT) {
      return { valid: false, error: `Minimum stake amount is ${Number(this.MIN_STAKE_AMOUNT) / 10**7} KALE` };
    }

    if (request.stakeAmount > this.MAX_STAKE_AMOUNT) {
      return { valid: false, error: `Maximum stake amount is ${Number(this.MAX_STAKE_AMOUNT) / 10**7} KALE` };
    }

    // Check if cycle exists and is active
    const cycleCheck = await db.query(`
      SELECT current_state, start_block, end_block
      FROM weather_cycles
      WHERE cycle_id = $1
    `, [request.cycleId]);

    if (cycleCheck.rows.length === 0) {
      return { valid: false, error: 'Weather cycle not found' };
    }

    const cycle = cycleCheck.rows[0];
    if (cycle.current_state !== 'active') {
      return { valid: false, error: 'Weather cycle is not active' };
    }

    // Validate target block is within cycle range
    const startBlock = BigInt(cycle.start_block);
    const endBlock = BigInt(cycle.end_block);
    
    if (request.targetBlock < startBlock || request.targetBlock > endBlock) {
      return { valid: false, error: `Target block must be between ${startBlock} and ${endBlock}` };
    }

    // Check user has sufficient balance
    const balanceCheck = await db.query(`
      SELECT current_balance
      FROM custodial_wallets
      WHERE user_id = $1 AND is_active = true
    `, [request.userId]);

    if (balanceCheck.rows.length === 0) {
      return { valid: false, error: 'Custodial wallet not found' };
    }

    const balance = BigInt(balanceCheck.rows[0].current_balance);
    if (balance < request.stakeAmount) {
      return { valid: false, error: 'Insufficient balance' };
    }

    return { valid: true };
  }

  /**
   * Check for duplicate request
   */
  private async checkDuplicateRequest(userId: string, cycleId: bigint, targetBlock: bigint): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT request_id
        FROM plant_requests
        WHERE user_id = $1 AND cycle_id = $2 AND target_block = $3
        AND status IN ('queued', 'executing', 'completed')
      `, [userId, cycleId, targetBlock]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('[PlantRequestService] Failed to check duplicate request:', error);
      return false;
    }
  }

  /**
   * Calculate estimated block time (simplified)
   */
  private calculateBlockTime(blockNumber: bigint): Date {
    // Stellar blocks are ~5 seconds apart
    const currentTime = Date.now();
    const estimatedMs = currentTime + (Number(blockNumber) * 5000);
    return new Date(estimatedMs);
  }

  /**
   * Get service statistics
   */
  async getServiceStatistics(): Promise<{
    totalRequests: number;
    queuedRequests: number;
    completedRequests: number;
    failedRequests: number;
    activeCycles: number;
  }> {
    try {
      const [totalResult, queuedResult, completedResult, failedResult, cyclesResult] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM plant_requests'),
        db.query('SELECT COUNT(*) as count FROM plant_requests WHERE status = \'queued\''),
        db.query('SELECT COUNT(*) as count FROM plant_requests WHERE status = \'completed\''),
        db.query('SELECT COUNT(*) as count FROM plant_requests WHERE status = \'failed\''),
        db.query('SELECT COUNT(*) as count FROM weather_cycles WHERE current_state = \'active\'')
      ]);

      return {
        totalRequests: parseInt(totalResult.rows[0].count),
        queuedRequests: parseInt(queuedResult.rows[0].count),
        completedRequests: parseInt(completedResult.rows[0].count),
        failedRequests: parseInt(failedResult.rows[0].count),
        activeCycles: parseInt(cyclesResult.rows[0].count)
      };
    } catch (error) {
      console.error('[PlantRequestService] Failed to get statistics:', error);
      return {
        totalRequests: 0,
        queuedRequests: 0,
        completedRequests: 0,
        failedRequests: 0,
        activeCycles: 0
      };
    }
  }
}

export const plantRequestService = new PlantRequestService();