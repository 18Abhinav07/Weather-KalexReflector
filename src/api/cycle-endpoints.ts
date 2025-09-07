// Cycle Management API Endpoints
// Real-time cycle interaction for demo

import { Request, Response } from 'express';
import { cycleBlockMonitor, CyclePhase } from '../services/cycle-block-monitor';
import { db } from '../database/connection';

export interface CycleAction {
  userId: string;
  cycleId: string;
  block: number;
  actionType: 'agriculture' | 'wager' | 'stay';
  actionData: {
    // Agriculture actions
    agricultureType?: 'store' | 'plant';
    stakeAmount?: string;
    
    // Wager actions  
    wagerType?: 'good' | 'bad';
    wagerAmount?: string;
  };
}

export class CycleAPI {
  
  /**
   * Get current cycle status
   */
  async getCurrentCycle(req: Request, res: Response): Promise<void> {
    try {
      const cycle = cycleBlockMonitor.getCurrentCycle();
      
      if (!cycle) {
        res.json({
          success: false,
          error: 'No active cycle found'
        });
        return;
      }

      // Get cycle participants
      const participants = await db.query(`
        SELECT 
          COUNT(DISTINCT user_id) as total_participants,
          SUM(CASE WHEN action_type = 'agriculture' THEN 1 ELSE 0 END) as farmers,
          SUM(CASE WHEN action_type = 'wager' THEN 1 ELSE 0 END) as wagerers
        FROM cycle_actions 
        WHERE cycle_id = $1
      `, [cycle.cycleId]);

      res.json({
        success: true,
        data: {
          cycle: {
            cycleId: cycle.cycleId.toString(),
            startBlock: cycle.startBlock.toString(),
            endBlock: cycle.endBlock.toString(),
            currentBlock: cycle.currentBlock.toString(),
            phase: cycle.phase,
            blocksRemaining: cycle.blocksRemaining,
            phaseProgress: cycle.phaseProgress
          },
          participants: participants.rows[0] || { total_participants: 0, farmers: 0, wagerers: 0 },
          canPlant: cycle.phase === CyclePhase.PLANTING,
          canWager: [CyclePhase.PLANTING, CyclePhase.WORKING].includes(cycle.phase),
          phaseDescription: this.getPhaseDescription(cycle.phase, cycle.currentBlock)
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get cycle status'
      });
    }
  }

  /**
   * Submit user action for current cycle
   */
  async submitAction(req: Request, res: Response): Promise<void> {
    try {
      const { userId, actionType, actionData } = req.body as CycleAction;
      
      const cycle = cycleBlockMonitor.getCurrentCycle();
      if (!cycle) {
        res.status(400).json({
          success: false,
          error: 'No active cycle'
        });
        return;
      }

      // Validate action based on current phase
      const validationResult = this.validateAction(cycle.phase, actionType, actionData);
      if (!validationResult.valid) {
        res.status(400).json({
          success: false,
          error: validationResult.error
        });
        return;
      }

      // Store action in database
      await db.query(`
        INSERT INTO cycle_actions (
          user_id, cycle_id, block_number, action_type, action_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id, cycle_id, block_number) 
        DO UPDATE SET action_type = $4, action_data = $5, created_at = NOW()
      `, [
        userId,
        cycle.cycleId,
        cycle.currentBlock,
        actionType,
        JSON.stringify(actionData)
      ]);

      // Process the action
      let processResult: any = { success: true };
      if (actionType === 'agriculture' && actionData.agricultureType === 'plant') {
        processResult = await this.processPlantAction(userId, cycle.cycleId, actionData.stakeAmount || '0');
      } else if (actionType === 'wager') {
        processResult = await this.processWagerAction(userId, cycle.cycleId, actionData.wagerType!, actionData.wagerAmount || '0');
      }

      res.json({
        success: true,
        data: {
          actionSubmitted: true,
          cycle: {
            cycleId: cycle.cycleId.toString(),
            currentBlock: cycle.currentBlock.toString(),
            phase: cycle.phase
          },
          processResult
        },
        message: `${actionType} action submitted for block ${cycle.currentBlock}`
      });

    } catch (error) {
      console.error('[CycleAPI] Submit action failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit action'
      });
    }
  }

  /**
   * Get user's actions for current cycle
   */
  async getUserActions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const cycle = cycleBlockMonitor.getCurrentCycle();
      
      if (!cycle) {
        res.json({
          success: true,
          data: { actions: [], cycle: null }
        });
        return;
      }

      const actions = await db.query(`
        SELECT block_number, action_type, action_data, created_at
        FROM cycle_actions
        WHERE user_id = $1 AND cycle_id = $2
        ORDER BY block_number ASC
      `, [userId, cycle.cycleId]);

      res.json({
        success: true,
        data: {
          cycle: {
            cycleId: cycle.cycleId.toString(),
            phase: cycle.phase,
            currentBlock: cycle.currentBlock.toString()
          },
          actions: actions.rows.map(row => ({
            block: row.block_number,
            actionType: row.action_type,
            actionData: row.action_data,
            timestamp: row.created_at
          }))
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user actions'
      });
    }
  }

  /**
   * Get cycle results (weather outcome and rewards)
   */
  async getCycleResults(req: Request, res: Response): Promise<void> {
    try {
      const { cycleId } = req.params;
      
      // Get cycle weather outcome
      const cycleResult = await db.query(`
        SELECT cycle_id, weather_outcome, weather_confidence, 
               current_state, completed_at
        FROM weather_cycles
        WHERE cycle_id = $1
      `, [cycleId]);

      if (cycleResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Cycle not found'
        });
        return;
      }

      const cycle = cycleResult.rows[0];

      // Get all participants and their rewards/penalties
      const participants = await db.query(`
        SELECT 
          ca.user_id,
          ca.action_type,
          ca.action_data,
          fp.stake_amount,
          fp.base_reward,
          fp.final_reward,
          fp.weather_modifier,
          fp.status as position_status
        FROM cycle_actions ca
        LEFT JOIN farm_positions fp ON ca.user_id = fp.user_id AND fp.cycle_id = ca.cycle_id
        WHERE ca.cycle_id = $1
        ORDER BY ca.user_id
      `, [cycleId]);

      res.json({
        success: true,
        data: {
          cycleId: cycle.cycle_id,
          weatherOutcome: cycle.weather_outcome,
          weatherConfidence: cycle.weather_confidence,
          cycleState: cycle.current_state,
          completedAt: cycle.completed_at,
          participants: participants.rows.map(p => ({
            userId: p.user_id,
            actionType: p.action_type,
            actionData: p.action_data,
            stakeAmount: p.stake_amount?.toString(),
            baseReward: p.base_reward?.toString(),
            finalReward: p.final_reward?.toString(),
            weatherModifier: p.weather_modifier,
            positionStatus: p.position_status,
            outcome: this.calculateParticipantOutcome(p, cycle.weather_outcome)
          }))
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get cycle results'
      });
    }
  }

  /**
   * Get live cycle feed (for CLI polling)
   */
  async getLiveFeed(req: Request, res: Response): Promise<void> {
    try {
      const cycle = cycleBlockMonitor.getCurrentCycle();
      const status = cycleBlockMonitor.getStatus();
      
      if (!cycle) {
        res.json({
          success: true,
          data: {
            monitoring: status.isRunning,
            currentBlock: status.currentBlock.toString(),
            cycle: null,
            prompt: null
          }
        });
        return;
      }

      // Generate user prompt based on current phase
      const prompt = this.generateUserPrompt(cycle);

      res.json({
        success: true,
        data: {
          monitoring: status.isRunning,
          currentBlock: cycle.currentBlock.toString(),
          cycle: {
            cycleId: cycle.cycleId.toString(),
            phase: cycle.phase,
            blocksRemaining: cycle.blocksRemaining,
            phaseProgress: cycle.phaseProgress
          },
          prompt
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get live feed'
      });
    }
  }

  /**
   * Validate user action based on cycle phase
   */
  private validateAction(phase: CyclePhase, actionType: string, actionData: any): { valid: boolean; error?: string } {
    if (actionType === 'agriculture') {
      if (phase !== CyclePhase.PLANTING) {
        return { valid: false, error: 'Agriculture actions only allowed during planting phase (blocks 0-6)' };
      }
      if (!actionData.agricultureType || !['store', 'plant'].includes(actionData.agricultureType)) {
        return { valid: false, error: 'Invalid agriculture type. Must be "store" or "plant"' };
      }
    } else if (actionType === 'wager') {
      if (![CyclePhase.PLANTING, CyclePhase.WORKING].includes(phase)) {
        return { valid: false, error: 'Wager actions only allowed during planting and working phases (blocks 0-8)' };
      }
      if (!actionData.wagerType || !['good', 'bad'].includes(actionData.wagerType)) {
        return { valid: false, error: 'Invalid wager type. Must be "good" or "bad"' };
      }
    } else if (actionType !== 'stay') {
      return { valid: false, error: 'Invalid action type. Must be "agriculture", "wager", or "stay"' };
    }

    return { valid: true };
  }

  /**
   * Process plant action
   */
  private async processPlantAction(userId: string, cycleId: bigint, stakeAmount: string): Promise<any> {
    try {
      // Create farm position
      const result = await db.query(`
        INSERT INTO farm_positions (
          user_id, cycle_id, stake_amount, plant_block, status, created_at
        ) VALUES ($1, $2, $3, $4, 'planted', NOW())
        RETURNING position_id
      `, [userId, cycleId, stakeAmount, cycleBlockMonitor.getCurrentCycle()?.currentBlock]);

      return {
        success: true,
        positionId: result.rows[0].position_id,
        stakeAmount,
        status: 'planted'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process wager action
   */
  private async processWagerAction(userId: string, cycleId: bigint, wagerType: string, wagerAmount: string): Promise<any> {
    try {
      // Store wager (simplified - could create separate wagers table)
      return {
        success: true,
        wagerType,
        wagerAmount,
        status: 'placed'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate participant outcome
   */
  private calculateParticipantOutcome(participant: any, weatherOutcome: string): string {
    if (participant.action_type === 'agriculture') {
      if (weatherOutcome === 'GOOD') {
        return `🌞 GOOD WEATHER: +50% bonus! Final reward: ${participant.final_reward || 'calculating...'}`;
      } else if (weatherOutcome === 'BAD') {
        return `🌧️ BAD WEATHER: -50% penalty. Final reward: ${participant.final_reward || 'calculating...'}`;
      }
      return 'Weather outcome pending...';
    } else if (participant.action_type === 'wager') {
      const actionData = participant.action_data;
      const wagerType = actionData.wagerType;
      const correct = (wagerType === 'good' && weatherOutcome === 'GOOD') || 
                      (wagerType === 'bad' && weatherOutcome === 'BAD');
      return correct ? `🎯 CORRECT WAGER: Won ${actionData.wagerAmount || '0'} KALE!` : 
                      `❌ WRONG WAGER: Lost ${actionData.wagerAmount || '0'} KALE`;
    }
    return 'No action taken';
  }

  /**
   * Generate user prompt based on cycle phase
   */
  private generateUserPrompt(cycle: any): any {
    const blockInCycle = Number(cycle.currentBlock - cycle.startBlock);
    
    switch (cycle.phase) {
      case CyclePhase.PLANTING:
        return {
          title: `🌱 PLANTING PHASE - Block ${blockInCycle + 1}/10`,
          message: `Cycle ${cycle.cycleId} is in planting phase. Choose your action:`,
          actions: [
            { id: 'agriculture', label: 'Agriculture', options: ['store', 'plant'] },
            { id: 'wager', label: 'Wager', options: ['good', 'bad'] },
            { id: 'stay', label: 'Stay (no action)' }
          ]
        };
        
      case CyclePhase.WORKING:
        return {
          title: `🔨 WORKING PHASE - Block ${blockInCycle + 1}/10`,
          message: `Work processing started. You can still place wagers:`,
          actions: [
            { id: 'wager', label: 'Wager', options: ['good', 'bad'] },
            { id: 'stay', label: 'Stay (no action)' }
          ]
        };
        
      case CyclePhase.REVEALING:
        return {
          title: `🎭 REVEALING PHASE - Block ${blockInCycle + 1}/10`,
          message: `DAO votes are being revealed! Weather outcome coming soon...`,
          actions: [
            { id: 'stay', label: 'Wait for results' }
          ]
        };
        
      case CyclePhase.SETTLING:
        return {
          title: `💰 SETTLING PHASE - Block ${blockInCycle + 1}/10`,
          message: `Weather revealed! Calculating rewards and penalties...`,
          actions: [
            { id: 'stay', label: 'View results' }
          ]
        };
        
      default:
        return null;
    }
  }

  /**
   * Get phase description
   */
  private getPhaseDescription(phase: CyclePhase, currentBlock: bigint): string {
    switch (phase) {
      case CyclePhase.PLANTING:
        return `Farmers can plant crops and users can place weather wagers (blocks 0-6)`;
      case CyclePhase.WORKING:
        return `Work processing active, final wagers accepted (blocks 7-8)`;
      case CyclePhase.REVEALING:
        return `DAO votes being revealed to determine weather outcome (block 9)`;
      case CyclePhase.SETTLING:
        return `Weather outcome applied, rewards/penalties calculated (block 10+)`;
      default:
        return `Block ${currentBlock}`;
    }
  }
}

export const cycleAPI = new CycleAPI();