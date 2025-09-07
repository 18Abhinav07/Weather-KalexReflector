import { describe, it, expect, beforeEach } from 'bun:test';
import WagerService from '../services/wagerService.js';

describe('WagerService Calculations (No Database)', () => {
  let wagerService: WagerService;

  beforeEach(() => {
    wagerService = new WagerService();
  });

  describe('calculateBetInfluence', () => {
    it('should return neutral influence when stakes are equal', () => {
      const result = wagerService.calculateBetInfluence(1000, 1000);
      
      expect(result.betInfluence).toBeCloseTo(0, 2);
      expect(result.totalStakes).toBe(2000);
      expect(result.goodStakes).toBe(1000);
      expect(result.badStakes).toBe(1000);
    });

    it('should calculate positive influence when GOOD stakes dominate', () => {
      const result = wagerService.calculateBetInfluence(1500, 500);
      
      expect(result.betInfluence).toBeGreaterThan(0);
      expect(result.betInfluence).toBeLessThanOrEqual(2.0);
      expect(result.totalStakes).toBe(2000);
      expect(result.goodStakes).toBe(1500);
      expect(result.badStakes).toBe(500);
    });

    it('should calculate negative influence when BAD stakes dominate', () => {
      const result = wagerService.calculateBetInfluence(300, 1200);
      
      expect(result.betInfluence).toBeLessThan(0);
      expect(result.betInfluence).toBeGreaterThanOrEqual(-2.0);
      expect(result.totalStakes).toBe(1500);
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
      const noBadStakes = wagerService.calculateBetInfluence(1000, 0);  
      expect(noBadStakes.betInfluence).toBe(2.0);

      const noGoodStakes = wagerService.calculateBetInfluence(0, 1000);
      expect(noGoodStakes.betInfluence).toBe(-2.0);

      const noStakes = wagerService.calculateBetInfluence(0, 0);
      expect(noStakes.betInfluence).toBe(0);
      expect(noStakes.totalStakes).toBe(0);
    });

    it('should calculate influence strength correctly', () => {
      const result = wagerService.calculateBetInfluence(750, 250); // 75% vs 25%
      
      expect(result.stakeRatio).toBeCloseTo(0.75, 2);
      expect(result.influenceStrength).toBeGreaterThan(0);
    });
  });
});