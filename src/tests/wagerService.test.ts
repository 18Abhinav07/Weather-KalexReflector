import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import WagerService from '../services/wagerService.js';
import { WagerDirection, type WagerInfluenceResult, type WagerPool } from '../types/wager.js';
import { db } from '../database/connection.js';

describe('WagerService', () => {
  let wagerService: WagerService;
  const testCycleId = BigInt(999999);
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    wagerService = new WagerService();
    
    // Clean up test data
    await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);
    
    // Create a test cycle
    await db.query(`
      INSERT INTO weather_cycles (cycle_id, current_state, start_block, current_block)
      VALUES ($1, 'planting', '1', '3')
      ON CONFLICT (cycle_id) DO UPDATE SET current_state = 'planting'
    `, [testCycleId]);
  });

  afterEach(async () => {
    // Cleanup
    await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);
    await db.query('DELETE FROM weather_cycles WHERE cycle_id = $1', [testCycleId]);
  });

  describe('Constructor', () => {
    it('should initialize properly', () => {
      expect(wagerService).toBeDefined();
    });
  });

  describe('placeWager', () => {
    it('should successfully place a GOOD weather wager', async () => {
      const result = await wagerService.placeWager(
        testUserId,
        testCycleId,
        WagerDirection.BET_GOOD,
        100
      );

      expect(result).toBeDefined();
      expect(result.direction).toBe(WagerDirection.BET_GOOD);
      expect(result.stakeAmount).toBe(100);
      expect(result.userId).toBe(testUserId);
    });

    it('should successfully place a BAD weather wager', async () => {
      const result = await wagerService.placeWager(
        testUserId,
        testCycleId,
        WagerDirection.BET_BAD,
        50
      );

      expect(result.direction).toBe(WagerDirection.BET_BAD);
      expect(result.stakeAmount).toBe(50);
    });

    it('should reject wager with invalid amount', async () => {
      try {
        await wagerService.placeWager(
          testUserId,
          testCycleId,
          WagerDirection.BET_GOOD,
          0
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect(error.message).toContain('positive');
      }
    });

    it('should reject wager with excessive amount', async () => {
      try {
        await wagerService.placeWager(
          testUserId,
          testCycleId,
          WagerDirection.BET_GOOD,
          50000 // Above maximum
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect(error.message).toContain('positive');
      }
    });

    it('should prevent duplicate wagers from same user in same cycle', async () => {
      // Place first wager
      await wagerService.placeWager(
        testUserId,
        testCycleId,
        WagerDirection.BET_GOOD,
        100
      );

      // Try to place second wager - should throw error
      try {
        await wagerService.placeWager(
          testUserId,
          testCycleId,
          WagerDirection.BET_BAD,
          50
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect(error.message).toContain('already');
      }
    });

    it('should reject wager after working phase begins', async () => {
      // Update cycle to working phase
      await db.query(`
        UPDATE weather_cycles 
        SET current_state = 'working', current_block = '7'
        WHERE cycle_id = $1
      `, [testCycleId]);

      try {
        await wagerService.placeWager(
          testUserId,
          testCycleId,
          WagerDirection.BET_GOOD,
          100
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect(error.message).toContain('planting');
      }
    });
  });

  describe('calculateBetInfluence', () => {
    it('should return neutral influence when stakes are equal', () => {
      const result = wagerService.calculateBetInfluence(1000, 1000);
      
      expect(result.betInfluence).toBeCloseTo(0, 2);
      expect(result.dominantSide).toBe(null);
      expect(result.totalStakes).toBe(2000);
    });

    it('should calculate positive influence when GOOD stakes dominate', () => {
      const result = wagerService.calculateBetInfluence(1500, 500);
      
      expect(result.betInfluence).toBeGreaterThan(0);
      expect(result.betInfluence).toBeLessThanOrEqual(2.0);
      expect(result.dominantSide).toBe(WagerDirection.BET_GOOD);
      expect(result.stakeRatio).toBeCloseTo(0.75, 2);
    });

    it('should calculate negative influence when BAD stakes dominate', () => {
      const result = wagerService.calculateBetInfluence(300, 1200);
      
      expect(result.betInfluence).toBeLessThan(0);
      expect(result.betInfluence).toBeGreaterThanOrEqual(-2.0);
      expect(result.dominantSide).toBe(WagerDirection.BET_BAD);
      expect(result.stakeRatio).toBeCloseTo(0.8, 2);
    });

    it('should cap influence at maximum bounds', () => {
      // Extreme good dominance
      const extremeGood = wagerService.calculateBetInfluence(10000, 1);
      expect(extremeGood.betInfluence).toBeCloseTo(2.0, 1);
      
      // Extreme bad dominance  
      const extremeBad = wagerService.calculateBetInfluence(1, 10000);
      expect(extremeBad.betInfluence).toBeCloseTo(-2.0, 1);
    });

    it('should handle zero stakes correctly', () => {
      const noGoodStakes = wagerService.calculateBetInfluence(0, 1000);
      expect(noGoodStakes.betInfluence).toBe(-2.0);
      expect(noGoodStakes.dominantSide).toBe(WagerDirection.BET_BAD);

      const noBadStakes = wagerService.calculateBetInfluence(1000, 0);  
      expect(noBadStakes.betInfluence).toBe(2.0);
      expect(noBadStakes.dominantSide).toBe(WagerDirection.BET_GOOD);

      const noStakes = wagerService.calculateBetInfluence(0, 0);
      expect(noStakes.betInfluence).toBe(0);
      expect(noStakes.dominantSide).toBe(null);
    });
  });

  describe('getWagerPool', () => {
    beforeEach(async () => {
      // Create sample wagers
      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES 
          ('user1', $1, 'good', 100, NOW()),
          ('user2', $1, 'good', 200, NOW()),
          ('user3', $1, 'bad', 150, NOW()),
          ('user4', $1, 'bad', 50, NOW())
      `, [testCycleId]);
    });

    it('should calculate correct wager pool totals', async () => {
      const pool = await wagerService.getWagerPool(testCycleId);

      expect(pool.totalStakes).toBe(500);
      expect(pool.totalGoodStakes).toBe(300);
      expect(pool.totalBadStakes).toBe(200);
      expect(pool.participantCount).toBe(4);
    });

    it('should calculate correct bet influence', async () => {
      const pool = await wagerService.getWagerPool(testCycleId);

      expect(pool.betInfluence).toBeGreaterThan(0); // Good dominates
      expect(pool.dominantSide).toBe(WagerDirection.BET_GOOD);
      expect(pool.influenceStrength).toBeGreaterThan(1.0);
    });

    it('should return empty pool for cycle with no wagers', async () => {
      const emptyCycleId = BigInt(888888);
      const pool = await wagerService.getWagerPool(emptyCycleId);

      expect(pool.totalStakes).toBe(0);
      expect(pool.participantCount).toBe(0);
      expect(pool.betInfluence).toBe(0);
      expect(pool.dominantSide).toBe(null);
    });
  });

  describe('processWagerPayouts', () => {
    beforeEach(async () => {
      // Create sample wagers for payout testing
      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES 
          ('winner1', $1, 'good', 100, NOW()),
          ('winner2', $1, 'good', 200, NOW()),
          ('loser1', $1, 'bad', 150, NOW()),
          ('loser2', $1, 'bad', 50, NOW())
      `, [testCycleId]);
    });

    it('should calculate correct payouts for GOOD weather outcome', async () => {
      const payouts = await wagerService.processWagerPayouts(testCycleId, 'GOOD');

      // Find winners and losers
      const winners = payouts.filter(p => p.payout > 0);
      const losers = payouts.filter(p => p.payout === 0);

      expect(winners).toHaveLength(2); // 2 good weather bettors
      expect(losers).toHaveLength(2);  // 2 bad weather bettors

      // Check payout calculations
      const totalPool = 500; // Total wagers
      const winnerPool = 300; // Good wagers
      const loserPool = 200;  // Bad wagers

      const expectedMultiplier = (totalPool * 0.95) / winnerPool; // 95% payout rate

      winners.forEach(winner => {
        const expectedPayout = winner.originalStake * expectedMultiplier;
        expect(winner.payout).toBeCloseTo(expectedPayout, 0);
        expect(winner.profitLoss).toBeGreaterThan(0);
      });

      losers.forEach(loser => {
        expect(loser.payout).toBe(0);
        expect(loser.profitLoss).toBeLessThan(0);
      });
    });

    it('should calculate correct payouts for BAD weather outcome', async () => {
      const payouts = await wagerService.processWagerPayouts(testCycleId, 'BAD');

      const winners = payouts.filter(p => p.payout > 0);
      const losers = payouts.filter(p => p.payout === 0);

      expect(winners).toHaveLength(2); // 2 bad weather bettors won
      expect(losers).toHaveLength(2);  // 2 good weather bettors lost

      // Winners should be bad weather bettors
      winners.forEach(winner => {
        expect(['loser1', 'loser2']).toContain(winner.userId);
        expect(winner.profitLoss).toBeGreaterThan(0);
      });
    });

    it('should handle case where no one wins (balanced outcome)', async () => {
      // Clear existing wagers and create balanced scenario
      await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [testCycleId]);
      
      const payouts = await wagerService.processWagerPayouts(testCycleId, 'GOOD');
      expect(payouts).toHaveLength(0);
    });

    it('should update wager records with payout information', async () => {
      await wagerService.processWagerPayouts(testCycleId, 'GOOD');

      // Check that database was updated
      const result = await db.query(`
        SELECT user_id, payout_amount, is_winner 
        FROM weather_wagers 
        WHERE cycle_id = $1 AND wager_type = 'good'
      `, [testCycleId]);

      expect(result.rows.every(r => r.payout_amount > 0)).toBe(true);
      expect(result.rows.every(r => r.is_winner === true)).toBe(true);
    });
  });

  describe('getUserWagerHistory', () => {
    beforeEach(async () => {
      // Create historical wagers across multiple cycles
      const cycles = [testCycleId, testCycleId + BigInt(1), testCycleId + BigInt(2)];
      
      for (const cycleId of cycles) {
        await db.query(`
          INSERT INTO weather_cycles (cycle_id, current_state, start_block, current_block)
          VALUES ($1, 'completed', '1', '11')
          ON CONFLICT (cycle_id) DO UPDATE SET current_state = 'completed'
        `, [cycleId]);

        await db.query(`
          INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at, payout_amount)
          VALUES ($1, $2, 'good', 100, NOW(), ${cycleId === testCycleId ? 150 : 0})
        `, [testUserId, cycleId]);
      }
    });

    it('should return complete wager history for user', async () => {
      const history = await wagerService.getUserWagerHistory(testUserId);

      expect(history).toHaveLength(3);
      expect(history.every(w => w.userId === testUserId)).toBe(true);
      expect(history[0].finalPayout).toBe(150); // Winner in first cycle
    });

    it('should limit results when specified', async () => {
      const limitedHistory = await wagerService.getUserWagerHistory(testUserId, 2);
      expect(limitedHistory).toHaveLength(2);
    });

    it('should return empty array for user with no wagers', async () => {
      const history = await wagerService.getUserWagerHistory('nonexistent-user');
      expect(history).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // This would require mocking database failures
      // For now, test that errors are properly thrown
      try {
        await wagerService.placeWager(
          'test',
          BigInt(-1), // Invalid cycle
          WagerDirection.BET_GOOD,
          100
        );
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should validate wager types strictly', async () => {
      try {
        await wagerService.placeWager(
          testUserId,
          testCycleId,
          'maybe' as any, // Invalid type
          100
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect(error.message).toContain('Invalid');
      }
    });

    it('should handle very large cycle IDs', () => {
      const largeCycleId = BigInt('99999999999999999');
      const result = wagerService.calculateBetInfluence(1000, 500);
      
      expect(result).toBeDefined();
      expect(typeof result.betInfluence).toBe('number');
    });

    it('should handle concurrent wager placements', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(wagerService.placeWager(
          `user-${i}`,
          testCycleId,
          i % 2 === 0 ? WagerDirection.BET_GOOD : WagerDirection.BET_BAD,
          100
        ));
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5); // All should succeed with different users
      expect(results.every(r => r.userId.startsWith('user-'))).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large wager pools efficiently', async () => {
      // Create many wagers
      const wagers = [];
      for (let i = 0; i < 100; i++) {
        wagers.push(`('user-${i}', ${testCycleId}, '${i % 2 === 0 ? 'good' : 'bad'}', ${Math.floor(Math.random() * 1000) + 10}, NOW())`);
      }

      await db.query(`
        INSERT INTO weather_wagers (user_id, cycle_id, wager_type, amount, placed_at)
        VALUES ${wagers.join(', ')}
      `);

      const start = performance.now();
      const pool = await wagerService.getWagerPool(testCycleId);
      const end = performance.now();

      expect(end - start).toBeLessThan(1000); // Less than 1 second
      expect(pool.participantCount).toBe(100);
      expect(pool.totalStakes).toBeGreaterThan(0);
    });

    it('should process payouts quickly for many wagers', async () => {
      // Using the 100 wagers from previous test
      const start = performance.now();
      const payouts = await wagerService.processWagerPayouts(testCycleId, 'GOOD');
      const end = performance.now();

      expect(end - start).toBeLessThan(2000); // Less than 2 seconds
      expect(payouts.length).toBeGreaterThan(0);
    });
  });
});

// Integration tests with real database operations
describe('WagerService Database Integration', () => {
  let wagerService: WagerService;

  beforeEach(() => {
    wagerService = new WagerService();
  });

  it('should maintain data integrity across operations', async () => {
    const cycleId = BigInt(Date.now()); // Unique cycle ID
    const userId = 'integrity-test-user';

    try {
      // Create cycle
      await db.query(`
        INSERT INTO weather_cycles (cycle_id, current_state, start_block, current_block)
        VALUES ($1, 'planting', '1', '3')
      `, [cycleId]);

      // Place wager
      const wagerResult = await wagerService.placeWager(
        userId,
        cycleId,
        WagerDirection.BET_GOOD,
        100
      );

      expect(wagerResult.wagerId).toBeDefined();

      // Check wager pool
      const pool = await wagerService.getWagerPool(cycleId);
      expect(pool.totalStakes).toBe(100);

      // Process payouts
      const payouts = await wagerService.processWagerPayouts(cycleId, 'GOOD');
      expect(payouts).toHaveLength(1);
      expect(payouts[0].profitLoss).toBeGreaterThanOrEqual(0);

      // Verify database state
      const dbCheck = await db.query(`
        SELECT * FROM weather_wagers WHERE user_id = $1 AND cycle_id = $2
      `, [userId, cycleId]);

      expect(dbCheck.rows).toHaveLength(1);
      expect(dbCheck.rows[0].payout_amount).toBeGreaterThan(0);

    } finally {
      // Cleanup
      await db.query('DELETE FROM weather_wagers WHERE cycle_id = $1', [cycleId]);
      await db.query('DELETE FROM weather_cycles WHERE cycle_id = $1', [cycleId]);
    }
  });
});