import { describe, it, expect, beforeEach } from 'bun:test';
import LocationSelector, { Location, LocationSelectionResult } from '../services/locationSelector.js';

describe('LocationSelector', () => {
  let locationSelector: LocationSelector;

  beforeEach(() => {
    locationSelector = new LocationSelector();
  });

  describe('Constructor', () => {
    it('should initialize with predefined locations', () => {
      const locations = locationSelector.getAllLocations();
      expect(locations.length).toBe(10);
      expect(locations[0]).toHaveProperty('id');
      expect(locations[0]).toHaveProperty('name');
      expect(locations[0]).toHaveProperty('country');
      expect(locations[0]).toHaveProperty('coordinates');
      expect(locations[0]).toHaveProperty('populationWeight');
    });

    it('should have valid coordinates for all locations', () => {
      const locations = locationSelector.getAllLocations();
      locations.forEach(location => {
        expect(location.coordinates.lat).toBeGreaterThanOrEqual(-90);
        expect(location.coordinates.lat).toBeLessThanOrEqual(90);
        expect(location.coordinates.lon).toBeGreaterThanOrEqual(-180);
        expect(location.coordinates.lon).toBeLessThanOrEqual(180);
      });
    });

    it('should have positive population weights', () => {
      const locations = locationSelector.getAllLocations();
      locations.forEach(location => {
        expect(location.populationWeight).toBeGreaterThan(0);
      });
    });
  });

  describe('selectLocationForCycle', () => {
    it('should return a valid location selection result', () => {
      const cycleId = '123';
      const blockEntropy = 'test-entropy-456';

      const result = locationSelector.selectLocationForCycle(cycleId, blockEntropy);

      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('selectionHash');
      expect(result).toHaveProperty('gridIndex');
      expect(result).toHaveProperty('blockEntropy');

      expect(result.location).toHaveProperty('id');
      expect(result.location).toHaveProperty('name');
      expect(result.selectionHash).toHaveLength(64); // SHA-256 hex string
      expect(result.blockEntropy).toBe(blockEntropy);
    });

    it('should be deterministic - same inputs produce same output', () => {
      const cycleId = '123';
      const blockEntropy = 'test-entropy-456';

      const result1 = locationSelector.selectLocationForCycle(cycleId, blockEntropy);
      const result2 = locationSelector.selectLocationForCycle(cycleId, blockEntropy);

      expect(result1.location.id).toBe(result2.location.id);
      expect(result1.selectionHash).toBe(result2.selectionHash);
      expect(result1.gridIndex).toBe(result2.gridIndex);
    });

    it('should produce different results for different inputs', () => {
      const cycleId1 = '123';
      const cycleId2 = '456';
      const blockEntropy = 'test-entropy';

      const result1 = locationSelector.selectLocationForCycle(cycleId1, blockEntropy);
      const result2 = locationSelector.selectLocationForCycle(cycleId2, blockEntropy);

      // Very high probability that different cycles produce different results
      expect(result1.selectionHash).not.toBe(result2.selectionHash);
    });

    it('should handle edge case inputs', () => {
      expect(() => {
        locationSelector.selectLocationForCycle('', '');
      }).not.toThrow();

      expect(() => {
        locationSelector.selectLocationForCycle('0', '0');
      }).not.toThrow();
    });
  });

  describe('getLocationById', () => {
    it('should return correct location for valid ID', () => {
      const location = locationSelector.getLocationById('tokyo-jp');
      expect(location).toBeTruthy();
      expect(location?.name).toBe('Tokyo');
      expect(location?.country).toBe('Japan');
    });

    it('should return null for invalid ID', () => {
      const location = locationSelector.getLocationById('invalid-id');
      expect(location).toBeNull();
    });

    it('should return null for empty ID', () => {
      const location = locationSelector.getLocationById('');
      expect(location).toBeNull();
    });
  });

  describe('validateLocationSelection', () => {
    it('should validate correct location selection', () => {
      const cycleId = '123';
      const blockEntropy = 'test-entropy';

      // First get the expected result
      const result = locationSelector.selectLocationForCycle(cycleId, blockEntropy);
      
      // Then validate it
      const isValid = locationSelector.validateLocationSelection(
        cycleId,
        blockEntropy,
        result.location.id
      );

      expect(isValid).toBe(true);
    });

    it('should reject incorrect location selection', () => {
      const cycleId = '123';
      const blockEntropy = 'test-entropy';

      const isValid = locationSelector.validateLocationSelection(
        cycleId,
        blockEntropy,
        'wrong-location-id'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('getLocationFarmingContext', () => {
    it('should return farming context for all locations', () => {
      const locations = locationSelector.getAllLocations();
      
      locations.forEach(location => {
        const context = locationSelector.getLocationFarmingContext(location);
        
        expect(context).toHaveProperty('location');
        expect(context).toHaveProperty('farmingSuitability');
        expect(context).toHaveProperty('climateZone');
        expect(context).toHaveProperty('seasonalFactors');
        
        expect(context.location).toBe(location);
        expect(['tropical-challenging', 'subtropical-moderate', 'temperate-ideal', 'cold-challenging'])
          .toContain(context.farmingSuitability);
        expect(['tropical', 'subtropical', 'temperate', 'subarctic', 'arctic'])
          .toContain(context.climateZone);
        expect(context.seasonalFactors).toHaveProperty('season');
        expect(context.seasonalFactors).toHaveProperty('isOptimalKaleGrowingSeason');
      });
    });

    it('should identify temperate locations as ideal for kale', () => {
      const london = locationSelector.getLocationById('london-uk')!;
      const context = locationSelector.getLocationFarmingContext(london);
      
      expect(context.farmingSuitability).toBe('temperate-ideal');
      expect(context.climateZone).toBe('temperate');
    });

    it('should handle tropical locations appropriately', () => {
      const singapore = locationSelector.getLocationById('singapore-sg')!;
      const context = locationSelector.getLocationFarmingContext(singapore);
      
      expect(context.farmingSuitability).toBe('tropical-challenging');
      expect(context.climateZone).toBe('tropical');
    });
  });

  describe('Population Weight Distribution', () => {
    it('should respect population weights in selection distribution', () => {
      const selections: { [key: string]: number } = {};
      const numTests = 1000;

      // Run multiple selections with different entropy
      for (let i = 0; i < numTests; i++) {
        const result = locationSelector.selectLocationForCycle('test-cycle', `entropy-${i}`);
        selections[result.location.id] = (selections[result.location.id] || 0) + 1;
      }

      // Check that high population cities are selected more frequently
      const mumbai = selections['mumbai-in'] || 0;
      const singapore = selections['singapore-sg'] || 0;
      
      // Mumbai (pop weight 20.4) should be selected more than Singapore (pop weight 5.9)
      expect(mumbai).toBeGreaterThan(singapore);
    });
  });

  describe('Cryptographic Properties', () => {
    it('should generate different hashes for sequential cycles', () => {
      const hashes = new Set();
      const blockEntropy = 'constant-entropy';

      for (let i = 0; i < 100; i++) {
        const result = locationSelector.selectLocationForCycle(i.toString(), blockEntropy);
        hashes.add(result.selectionHash);
      }

      // All hashes should be unique
      expect(hashes.size).toBe(100);
    });

    it('should produce uniform hash distribution', () => {
      const firstChars: { [key: string]: number } = {};
      
      for (let i = 0; i < 1000; i++) {
        const result = locationSelector.selectLocationForCycle(i.toString(), 'test');
        const firstChar = result.selectionHash[0];
        firstChars[firstChar] = (firstChars[firstChar] || 0) + 1;
      }

      // Check that hex characters are reasonably distributed
      const keys = Object.keys(firstChars);
      expect(keys.length).toBeGreaterThan(8); // Should see most hex chars
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long cycle IDs', () => {
      const longCycleId = 'x'.repeat(1000);
      const result = locationSelector.selectLocationForCycle(longCycleId, 'test');
      
      expect(result.location).toBeDefined();
      expect(result.selectionHash).toHaveLength(64);
    });

    it('should handle special characters in entropy', () => {
      const specialEntropy = '!@#$%^&*()_+{}[]|\\:";\'<>?,.~`';
      const result = locationSelector.selectLocationForCycle('test', specialEntropy);
      
      expect(result.location).toBeDefined();
      expect(result.selectionHash).toHaveLength(64);
    });

    it('should handle numeric cycle IDs consistently', () => {
      const result1 = locationSelector.selectLocationForCycle('123', 'test');
      const result2 = locationSelector.selectLocationForCycle('123', 'test');
      
      expect(result1.location.id).toBe(result2.location.id);
    });
  });
});

// Performance tests
describe('LocationSelector Performance', () => {
  let locationSelector: LocationSelector;

  beforeEach(() => {
    locationSelector = new LocationSelector();
  });

  it('should perform location selection quickly', () => {
    const start = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      locationSelector.selectLocationForCycle(i.toString(), 'test-entropy');
    }
    
    const end = performance.now();
    const timePerSelection = (end - start) / 1000;
    
    expect(timePerSelection).toBeLessThan(1); // Less than 1ms per selection
  });

  it('should handle concurrent selections', async () => {
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(Promise.resolve().then(() => 
        locationSelector.selectLocationForCycle(i.toString(), 'test-entropy')
      ));
    }
    
    const results = await Promise.all(promises);
    expect(results.length).toBe(100);
    expect(results.every(r => r.location && r.selectionHash)).toBe(true);
  });
});