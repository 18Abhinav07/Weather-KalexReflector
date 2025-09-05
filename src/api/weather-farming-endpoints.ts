// Weather Farming API Endpoints
// Implements user interface layer for SRS Phase 1 requirements

import { Request, Response } from 'express';
import { userService } from '../services/user-service';
import { depositMonitor } from '../services/deposit-monitor';
import { plantRequestService } from '../services/plant-request-service';
import { farmingAutomationEngine } from '../services/farming-automation-engine';
import { weatherIntegrationService } from '../services/weather-integration-service';
import { db } from '../database/connection';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class WeatherFarmingAPI {
  
  /**
   * User Registration - REQ-001
   */
  async registerUser(req: Request, res: Response): Promise<void> {
    try {
      const { username, email } = req.body;

      if (!username || !email) {
        res.status(400).json({
          success: false,
          error: 'Username and email are required'
        } as ApiResponse);
        return;
      }

      const user = await userService.registerUser(username, email);
      
      res.status(201).json({
        success: true,
        data: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          custodialWallet: user.custodialWallet,
          createdAt: user.createdAt
        },
        message: 'User registered successfully with custodial wallet'
      } as ApiResponse);

    } catch (error) {
      console.error('[API] User registration failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      } as ApiResponse);
    }
  }

  /**
   * Get User Profile and Balance
   */
  async getUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        } as ApiResponse);
        return;
      }

      const profile = await userService.getUserProfile(userId);
      if (!profile) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        } as ApiResponse);
        return;
      }

      const balanceSummary = await userService.getUserBalanceSummary(userId);
      
      res.json({
        success: true,
        data: {
          ...profile,
          balance: balanceSummary
        }
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get user profile failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user profile'
      } as ApiResponse);
    }
  }

  /**
   * Process KALE Deposit - REQ-002
   */
  async processDeposit(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, transactionHash } = req.body;

      if (!userId || !amount || !transactionHash) {
        res.status(400).json({
          success: false,
          error: 'User ID, amount, and transaction hash are required'
        } as ApiResponse);
        return;
      }

      const result = await depositMonitor.processDeposit(
        userId,
        BigInt(amount),
        transactionHash,
        'manual'
      );

      if (result) {
        res.json({
          success: true,
          data: {
            transactionId: result.transactionId,
            amount: result.amount.toString(),
            newBalance: result.newBalance.toString()
          },
          message: 'Deposit processed successfully'
        } as ApiResponse);
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to process deposit'
        } as ApiResponse);
      }

    } catch (error) {
      console.error('[API] Process deposit failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process deposit'
      } as ApiResponse);
    }
  }

  /**
   * Submit Plant Request - REQ-003
   */
  async submitPlantRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, stakeAmount, targetBlock } = req.body;

      if (!userId || !stakeAmount) {
        res.status(400).json({
          success: false,
          error: 'User ID and stake amount are required'
        } as ApiResponse);
        return;
      }

      const request = await plantRequestService.submitPlantRequest(
        userId,
        BigInt(stakeAmount),
        targetBlock ? BigInt(targetBlock) : undefined
      );

      res.status(201).json({
        success: true,
        data: {
          requestId: request.requestId,
          userId: request.userId,
          stakeAmount: request.stakeAmount.toString(),
          targetBlock: request.targetBlock.toString(),
          status: request.status,
          cycleId: request.cycleId?.toString(),
          createdAt: request.createdAt
        },
        message: 'Plant request submitted successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Submit plant request failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit plant request'
      } as ApiResponse);
    }
  }

  /**
   * Get Plant Request Status
   */
  async getPlantRequestStatus(req: Request, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;

      const request = await plantRequestService.getPlantRequest(requestId);
      if (!request) {
        res.status(404).json({
          success: false,
          error: 'Plant request not found'
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: {
          requestId: request.requestId,
          userId: request.userId,
          stakeAmount: request.stakeAmount.toString(),
          targetBlock: request.targetBlock.toString(),
          status: request.status,
          cycleId: request.cycleId?.toString(),
          errorMessage: request.errorMessage,
          transactionHash: request.transactionHash,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt
        }
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get plant request status failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get plant request status'
      } as ApiResponse);
    }
  }

  /**
   * Get User's Plant Requests
   */
  async getUserPlantRequests(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { status, limit = '50' } = req.query;

      const requests = await plantRequestService.getUserPlantRequests(
        userId,
        status as string,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: requests.map(request => ({
          requestId: request.requestId,
          stakeAmount: request.stakeAmount.toString(),
          targetBlock: request.targetBlock.toString(),
          status: request.status,
          cycleId: request.cycleId?.toString(),
          errorMessage: request.errorMessage,
          transactionHash: request.transactionHash,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt
        }))
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get user plant requests failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get plant requests'
      } as ApiResponse);
    }
  }

  /**
   * Get Farm Positions
   */
  async getFarmPositions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { status, limit = '50' } = req.query;

      let query = `
        SELECT fp.position_id, fp.user_id, fp.cycle_id, fp.stake_amount, fp.plant_block,
               fp.status, fp.plant_transaction_hash, fp.work_transaction_hash, 
               fp.harvest_transaction_hash, fp.base_reward, fp.final_reward, 
               fp.weather_modifier, fp.created_at,
               wc.weather_outcome, wc.weather_confidence
        FROM farm_positions fp
        LEFT JOIN weather_cycles wc ON fp.cycle_id = wc.cycle_id
        WHERE fp.user_id = $1
      `;

      const params: any[] = [userId];

      if (status) {
        query += ` AND fp.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY fp.created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit as string));

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          positionId: row.position_id,
          userId: row.user_id,
          cycleId: row.cycle_id?.toString(),
          stakeAmount: row.stake_amount?.toString(),
          plantBlock: row.plant_block?.toString(),
          status: row.status,
          plantTransactionHash: row.plant_transaction_hash,
          workTransactionHash: row.work_transaction_hash,
          harvestTransactionHash: row.harvest_transaction_hash,
          baseReward: row.base_reward?.toString(),
          finalReward: row.final_reward?.toString(),
          weatherModifier: row.weather_modifier,
          weatherOutcome: row.weather_outcome,
          weatherConfidence: row.weather_confidence,
          createdAt: row.created_at
        }))
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get farm positions failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get farm positions'
      } as ApiResponse);
    }
  }

  /**
   * Get Weather Cycles
   */
  async getWeatherCycles(req: Request, res: Response): Promise<void> {
    try {
      const { limit = '20', status } = req.query;

      let query = `
        SELECT cycle_id, start_block, end_block, current_state, weather_outcome,
               weather_confidence, total_participants, total_stake_amount, created_at
        FROM weather_cycles
      `;

      const params: any[] = [];

      if (status) {
        query += ` WHERE current_state = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY cycle_id DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit as string));

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          cycleId: row.cycle_id?.toString(),
          startBlock: row.start_block?.toString(),
          endBlock: row.end_block?.toString(),
          currentState: row.current_state,
          weatherOutcome: row.weather_outcome,
          weatherConfidence: row.weather_confidence,
          totalParticipants: row.total_participants,
          totalStakeAmount: row.total_stake_amount?.toString(),
          createdAt: row.created_at
        }))
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get weather cycles failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get weather cycles'
      } as ApiResponse);
    }
  }

  /**
   * Get Weather Statistics
   */
  async getWeatherStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await weatherIntegrationService.getWeatherStatistics();

      res.json({
        success: true,
        data: {
          totalCyclesSettled: stats.totalCyclesSettled,
          goodWeatherCycles: stats.goodWeatherCycles,
          badWeatherCycles: stats.badWeatherCycles,
          averageConfidence: stats.averageConfidence,
          totalRewardsDistributed: stats.totalRewardsDistributed.toString()
        }
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get weather statistics failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get weather statistics'
      } as ApiResponse);
    }
  }

  /**
   * Get Automation Status
   */
  async getAutomationStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = farmingAutomationEngine.getAutomationStatus();
      const healthCheck = await farmingAutomationEngine.healthCheck();

      res.json({
        success: true,
        data: {
          ...status,
          currentBlock: status.currentBlock.toString(),
          health: healthCheck.status
        }
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get automation status failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get automation status'
      } as ApiResponse);
    }
  }

  /**
   * Get Transaction History
   */
  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit = '50', type } = req.query;

      let query = `
        SELECT transaction_id, user_id, transaction_type, amount, wallet_address,
               related_position_id, related_cycle_id, metadata, created_at
        FROM transaction_log
        WHERE user_id = $1
      `;

      const params: any[] = [userId];

      if (type) {
        query += ` AND transaction_type = $${params.length + 1}`;
        params.push(type);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit as string));

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          transactionId: row.transaction_id,
          userId: row.user_id,
          transactionType: row.transaction_type,
          amount: row.amount?.toString(),
          walletAddress: row.wallet_address,
          relatedPositionId: row.related_position_id,
          relatedCycleId: row.related_cycle_id?.toString(),
          metadata: row.metadata,
          createdAt: row.created_at
        }))
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Get transaction history failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction history'
      } as ApiResponse);
    }
  }

  /**
   * Request Withdrawal - REQ-008 (placeholder)
   */
  async requestWithdrawal(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, withdrawalAddress } = req.body;

      if (!userId || !amount || !withdrawalAddress) {
        res.status(400).json({
          success: false,
          error: 'User ID, amount, and withdrawal address are required'
        } as ApiResponse);
        return;
      }

      // TODO: Implement withdrawal processing
      res.status(501).json({
        success: false,
        error: 'Withdrawal processing not yet implemented'
      } as ApiResponse);

    } catch (error) {
      console.error('[API] Request withdrawal failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process withdrawal request'
      } as ApiResponse);
    }
  }
}

export const weatherFarmingAPI = new WeatherFarmingAPI();