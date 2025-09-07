import crypto from 'crypto';
import logger from '../utils/logger.js';

interface Location {
  id: string;
  name: string;
  country: string;
  coordinates: {
    lat: number;
    lon: number;
  };
  populationWeight: number;
  timezone: string;
}

interface LocationSelectionResult {
  location: Location;
  selectionHash: string;
  gridIndex: number;
  blockEntropy: string;
}

class LocationSelector {
  private locations: Location[] = [
    {
      id: 'tokyo-jp',
      name: 'Tokyo',
      country: 'Japan',
      coordinates: { lat: 35.6762, lon: 139.6503 },
      populationWeight: 37.4,
      timezone: 'Asia/Tokyo'
    },
    {
      id: 'london-uk',
      name: 'London',
      country: 'United Kingdom',
      coordinates: { lat: 51.5074, lon: -0.1278 },
      populationWeight: 9.3,
      timezone: 'Europe/London'
    },
    {
      id: 'newyork-us',
      name: 'New York',
      country: 'United States',
      coordinates: { lat: 40.7128, lon: -74.0060 },
      populationWeight: 8.4,
      timezone: 'America/New_York'
    },
    {
      id: 'sydney-au',
      name: 'Sydney',
      country: 'Australia',
      coordinates: { lat: -33.8688, lon: 151.2093 },
      populationWeight: 5.3,
      timezone: 'Australia/Sydney'
    },
    {
      id: 'mumbai-in',
      name: 'Mumbai',
      country: 'India',
      coordinates: { lat: 19.0760, lon: 72.8777 },
      populationWeight: 20.4,
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'paris-fr',
      name: 'Paris',
      country: 'France',
      coordinates: { lat: 48.8566, lon: 2.3522 },
      populationWeight: 11.0,
      timezone: 'Europe/Paris'
    },
    {
      id: 'singapore-sg',
      name: 'Singapore',
      country: 'Singapore',
      coordinates: { lat: 1.3521, lon: 103.8198 },
      populationWeight: 5.9,
      timezone: 'Asia/Singapore'
    },
    {
      id: 'sao-paulo-br',
      name: 'São Paulo',
      country: 'Brazil',
      coordinates: { lat: -23.5505, lon: -46.6333 },
      populationWeight: 22.4,
      timezone: 'America/Sao_Paulo'
    },
    {
      id: 'cairo-eg',
      name: 'Cairo',
      country: 'Egypt',
      coordinates: { lat: 30.0444, lon: 31.2357 },
      populationWeight: 20.9,
      timezone: 'Africa/Cairo'
    },
    {
      id: 'mexico-city-mx',
      name: 'Mexico City',
      country: 'Mexico',
      coordinates: { lat: 19.4326, lon: -99.1332 },
      populationWeight: 21.8,
      timezone: 'America/Mexico_City'
    }
  ];

  constructor() {
    logger.info('LocationSelector initialized with global weather locations');
  }

  /**
   * Selects a real-world location based on cryptographic randomness
   * This is triggered at block 6 when the location is revealed to the public
   */
  selectLocationForCycle(cycleId: string, blockEntropy: string): LocationSelectionResult {
    logger.info(`Starting location selection for cycle: ${cycleId}`);

    // Create deterministic hash from block entropy and cycle ID
    const combinedInput = `${blockEntropy}${cycleId}`;
    const selectionHash = crypto
      .createHash('sha256')
      .update(combinedInput)
      .digest('hex');

    logger.info(`Generated location selection hash: ${JSON.stringify({ cycleId, blockEntropy: blockEntropy.substring(0, 16) + '...' })}`);

    // Calculate dynamic grid size based on available locations
    const gridSize = this.calculateDynamicGridSize();

    // Convert hash to grid index
    const hashInt = BigInt('0x' + selectionHash.substring(0, 16));
    const gridIndex = Number(hashInt % BigInt(gridSize));

    // Select location using population-weighted algorithm
    const selectedLocation = this.selectPopulationWeightedLocation(gridIndex);

    const result: LocationSelectionResult = {
      location: selectedLocation,
      selectionHash,
      gridIndex,
      blockEntropy
    };

    logger.info(`Location selected for weather farming: ${JSON.stringify({
      locationName: selectedLocation.name,
      country: selectedLocation.country,
      coordinates: selectedLocation.coordinates
    })}`);

    return result;
  }

  /**
   * Calculate dynamic grid size for location selection
   * This ensures fair distribution across the earth's populated areas
   */
  private calculateDynamicGridSize(): number {
    const baseGridSize = 1000;
    const populationFactor = this.locations.reduce((sum, loc) => sum + loc.populationWeight, 0);
    const dynamicSize = Math.floor(baseGridSize * (populationFactor / 100));
    
    return Math.max(dynamicSize, this.locations.length * 10); // Minimum 10x locations
  }

  /**
   * Select location using population-weighted random selection
   * Higher population areas have higher probability of selection
   */
  private selectPopulationWeightedLocation(gridIndex: number): Location {
    const totalWeight = this.locations.reduce((sum, loc) => sum + loc.populationWeight, 0);
    const targetWeight = (gridIndex % Math.floor(totalWeight * 100)) / 100;
    
    let cumulativeWeight = 0;
    for (const location of this.locations) {
      cumulativeWeight += location.populationWeight;
      if (cumulativeWeight >= targetWeight) {
        return location;
      }
    }
    
    // Fallback to last location if no match found
    return this.locations[this.locations.length - 1];
  }

  /**
   * Get location by ID for external queries
   */
  getLocationById(locationId: string): Location | null {
    return this.locations.find(loc => loc.id === locationId) || null;
  }

  /**
   * Get all available locations for reference
   */
  getAllLocations(): Location[] {
    return [...this.locations];
  }

  /**
   * Validate that a location selection was made correctly
   * This can be used for verification of the cryptographic process
   */
  validateLocationSelection(
    cycleId: string,
    blockEntropy: string,
    expectedLocationId: string
  ): boolean {
    try {
      const result = this.selectLocationForCycle(cycleId, blockEntropy);
      return result.location.id === expectedLocationId;
    } catch (error: any) {
      logger.error(`Failed to validate location selection: ${error.message}`);
      return false;
    }
  }

  /**
   * Get location suitable for kale growing analysis
   * Returns metadata needed for weather-based farming decisions
   */
  getLocationFarmingContext(location: Location) {
    return {
      location,
      farmingSuitability: this.assessKaleFarmingSuitability(location),
      climateZone: this.getClimateZone(location.coordinates.lat),
      seasonalFactors: this.getSeasonalFactors(location.coordinates.lat)
    };
  }

  private assessKaleFarmingSuitability(location: Location): string {
    const lat = Math.abs(location.coordinates.lat);
    
    if (lat < 20) return 'tropical-challenging';
    if (lat < 35) return 'subtropical-moderate';  
    if (lat < 50) return 'temperate-ideal';
    return 'cold-challenging';
  }

  private getClimateZone(latitude: number): string {
    const lat = Math.abs(latitude);
    
    if (lat < 23.5) return 'tropical';
    if (lat < 35) return 'subtropical';
    if (lat < 50) return 'temperate';
    if (lat < 66.5) return 'subarctic';
    return 'arctic';
  }

  private getSeasonalFactors(latitude: number) {
    const isNorthern = latitude >= 0;
    const currentMonth = new Date().getMonth() + 1; // 1-12
    
    // Kale grows best in cooler weather (spring/fall in temperate zones)
    let season = 'unknown';
    if (isNorthern) {
      if ([3, 4, 5].includes(currentMonth)) season = 'spring';
      else if ([6, 7, 8].includes(currentMonth)) season = 'summer';
      else if ([9, 10, 11].includes(currentMonth)) season = 'fall';
      else season = 'winter';
    } else {
      // Southern hemisphere seasons are reversed
      if ([9, 10, 11].includes(currentMonth)) season = 'spring';
      else if ([12, 1, 2].includes(currentMonth)) season = 'summer';
      else if ([3, 4, 5].includes(currentMonth)) season = 'fall';
      else season = 'winter';
    }

    return {
      season,
      isOptimalKaleGrowingSeason: season === 'spring' || season === 'fall'
    };
  }
}

export default LocationSelector;
export { Location, LocationSelectionResult };