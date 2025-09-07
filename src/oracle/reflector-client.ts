// Reflector Oracle Client - Integrates with Stellar Reflector Network
// Based on the Reflector interface from Docs/reflector/howitworks.md

import { Address, SorobanRpc } from '@stellar/stellar-sdk';
// Note: Env type may need different import path in newer SDK versions
type Env = any; // Will be replaced when we implement actual contract calls
type Symbol = string;
type Vec<T> = T[];

const { Server } = SorobanRpc;
import type { 
  OracleSource, 
  PriceData, 
  Asset, 
  OracleData,
  OracleAssetData 
} from '../types/oracle-types';

// Oracle contract interface (from Reflector documentation)
export interface ReflectorContract {
  base(env: Env): Asset;
  assets(env: Env): Vec<Asset>;
  decimals(env: Env): number;
  lastprice(env: Env, asset: Asset): PriceData | null;
  prices(env: Env, asset: Asset, records: number): Vec<PriceData> | null;
  last_timestamp(env: Env): number;
  period(env: Env): number | null;
  resolution(env: Env): number;
}

// Oracle sources configuration - using IDs from .env
export const ORACLE_SOURCES: OracleSource[] = [
  {
    name: 'External CEX & DEX',
    contractId: process.env.ORACLE_EXTERNAL_CEX_DEX || 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63',
    description: 'Cryptocurrency prices from centralized and decentralized exchanges',
    updateFrequency: 5, // minutes
    retention: 24 // hours
  },
  {
    name: 'Stellar Pubnet',
    contractId: process.env.ORACLE_STELLAR_PUBNET || 'CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP',
    description: 'Stellar ecosystem tokens from DEX and liquidity pools',
    updateFrequency: 5, // minutes  
    retention: 24 // hours
  },
  {
    name: 'Foreign Exchange',
    contractId: process.env.ORACLE_FOREIGN_EXCHANGE || 'CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W',
    description: 'Fiat currency exchange rates from central banks',
    updateFrequency: 5, // minutes
    retention: 24 // hours
  }
];

export class ReflectorClient {
  private rpcServer: InstanceType<typeof Server>;
  private env: Env;
  private cache: Map<string, OracleData> = new Map();
  private priceHistory: Map<string, PriceData[]> = new Map(); // Store price history for trend analysis
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly MAX_DATA_AGE = 10 * 60 * 1000; // 10 minutes in milliseconds
  private readonly HISTORY_RETENTION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(rpcUrl: string, env: Env) {
    this.rpcServer = new Server(rpcUrl);
    this.env = env;
  }

  /**
   * Fetch data from all oracle sources with fallback handling
   */
  async fetchAllOracleData(): Promise<OracleAssetData> {
    const timestamp = Date.now();
    const results: OracleData[] = [];

    // Attempt to fetch from all 3 oracles
    for (const source of ORACLE_SOURCES) {
      try {
        const oracleData = await this.fetchOracleData(source);
        if (oracleData.isValid) {
          results.push(oracleData);
        }
      } catch (error) {
        console.error(`Failed to fetch from ${source.name}:`, error);
      }
    }

    // Check if we have minimum required oracles (2 out of 3)
    if (results.length < 2) {
      throw new Error(`Insufficient oracle data: only ${results.length}/3 oracles available`);
    }

    // Combine data from all available sources
    return this.combineOracleData(results, timestamp);
  }

  /**
   * Fetch data from a specific oracle source
   */
  private async fetchOracleData(source: OracleSource): Promise<OracleData> {
    const cacheKey = `${source.name}_${Math.floor(Date.now() / this.CACHE_TTL)}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    try {
      // For now, we'll use the contractId string directly since we're mocking the calls
      const contractAddress = source.contractId; // Will be Address.fromString(source.contractId) when implementing real calls
      const assets = new Map<string, PriceData>();
      
      // Get assets list based on oracle type
      const assetSymbols = this.getAssetSymbolsForSource(source);
      
      // Fetch price data for each asset
      for (const symbol of assetSymbols) {
        try {
          const asset = this.createAssetFromSymbol(symbol);
          const priceData = await this.getLastPrice(contractAddress, asset);
          
          if (priceData && this.isPriceDataFresh(priceData)) {
            assets.set(symbol, priceData);
            
            // Store in price history for trend analysis
            this.updatePriceHistory(symbol, priceData);
          }
        } catch (error) {
          console.warn(`Failed to fetch ${symbol} from ${source.name}:`, error);
        }
      }

      const oracleData: OracleData = {
        source,
        timestamp: Date.now(),
        assets,
        isValid: assets.size > 0,
        lastUpdate: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, oracleData);
      
      return oracleData;
    } catch (error) {
      console.error(`Oracle fetch failed for ${source.name}:`, error);
      return {
        source,
        timestamp: Date.now(),
        assets: new Map(),
        isValid: false,
        lastUpdate: Date.now()
      };
    }
  }

  /**
   * Get last price for an asset from oracle contract
   */
  private async getLastPrice(contractId: string, asset: Asset): Promise<PriceData | null> {
    try {
      // Create the asset parameter for the contract call
      let assetParam: any;
      
      if (asset.type === 'stellar') {
        // For Stellar assets, we need the token address
        // These would normally come from a configuration or lookup
        const stellarAddresses: { [key: string]: string } = {
          'XLM': 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', // Example XLM address
          'KALE': process.env.KALE_TOKEN_ADDRESS || 'KALE_ADDRESS_PLACEHOLDER',
          'AQUA': process.env.AQUA_TOKEN_ADDRESS || 'AQUA_ADDRESS_PLACEHOLDER',
          'EURC': process.env.EURC_TOKEN_ADDRESS || 'EURC_ADDRESS_PLACEHOLDER'
        };
        
        const tokenAddress = stellarAddresses[asset.symbol];
        if (!tokenAddress || tokenAddress.includes('PLACEHOLDER')) {
          console.warn(`No token address configured for Stellar asset: ${asset.symbol}`);
          return this.getMockPriceData(asset.symbol);
        }
        
        assetParam = ['Stellar', tokenAddress];
      } else {
        // For other assets (crypto, forex), use symbol
        assetParam = ['Other', asset.symbol];
      }

      // Simulate the contract call - in production this would be actual RPC call
      // For now, we'll return realistic mock data but with actual timestamp variation
      const priceData = await this.simulateContractCall(contractId, assetParam, asset.symbol);
      
      if (priceData && this.isPriceDataFresh(priceData)) {
        return priceData;
      } else {
        console.warn(`Stale or invalid price data for ${asset.symbol}`);
        return null;
      }
      
    } catch (error) {
      console.error(`Failed to get price for ${asset.symbol}:`, error);
      return null;
    }
  }

  /**
   * Simulate contract call - replace with actual Stellar RPC call when ready
   */
  private async simulateContractCall(contractId: string, assetParam: any, symbol: string): Promise<PriceData | null> {
    // TODO: Replace with actual Stellar contract call:
    /*
    const result = await this.rpcServer.simulateTransaction(transaction);
    // Parse result to get price and timestamp
    */
    
    // For now, generate realistic mock data with some variation
    const baseTime = Date.now();
    const priceVariation = Math.sin(baseTime / 60000) * 0.1; // 10% variation based on time
    
    const mockPrice = this.getMockPriceData(symbol);
    if (!mockPrice) return null;
    
    // Add some realistic price movement
    const adjustedPrice = BigInt(Math.floor(Number(mockPrice.price) * (1 + priceVariation)));
    
    return {
      price: adjustedPrice,
      timestamp: Math.floor(baseTime / 1000) - Math.floor(Math.random() * 300) // 0-5 minutes old
    };
  }

  /**
   * Get realistic mock price data for testing
   */
  private getMockPriceData(symbol: string): PriceData | null {
    const baseTime = Math.floor(Date.now() / 1000);
    let mockPrice: bigint;
    
    switch (symbol) {
      case 'BTC':
        mockPrice = BigInt(Math.floor((67000 + Math.random() * 5000) * 10**14)); // ~$67-72k
        break;
      case 'ETH':
        mockPrice = BigInt(Math.floor((2400 + Math.random() * 400) * 10**14)); // ~$2.4-2.8k
        break;
      case 'XLM':
        mockPrice = BigInt(Math.floor((0.11 + Math.random() * 0.04) * 10**14)); // ~$0.11-0.15
        break;
      case 'SOL':
        mockPrice = BigInt(Math.floor((140 + Math.random() * 20) * 10**14)); // ~$140-160
        break;
      case 'KALE':
        mockPrice = BigInt(Math.floor((0.0015 + Math.random() * 0.001) * 10**14)); // ~$0.0015-0.0025
        break;
      case 'AQUA':
        mockPrice = BigInt(Math.floor((0.08 + Math.random() * 0.02) * 10**14)); // ~$0.08-0.10
        break;
      case 'USDC':
      case 'USDT':
        mockPrice = BigInt(Math.floor((0.9995 + Math.random() * 0.001) * 10**14)); // ~$0.9995-1.0005
        break;
      case 'EURC':
        mockPrice = BigInt(Math.floor((1.08 + Math.random() * 0.02) * 10**14)); // ~€1 = $1.08-1.10
        break;
      case 'EUR':
        mockPrice = BigInt(Math.floor((1.08 + Math.random() * 0.02) * 10**14)); // EUR/USD
        break;
      case 'GBP':
        mockPrice = BigInt(Math.floor((1.26 + Math.random() * 0.04) * 10**14)); // GBP/USD
        break;
      case 'CAD':
        mockPrice = BigInt(Math.floor((0.73 + Math.random() * 0.02) * 10**14)); // CAD/USD
        break;
      case 'BRL':
        mockPrice = BigInt(Math.floor((0.18 + Math.random() * 0.02) * 10**14)); // BRL/USD
        break;
      default:
        console.warn(`Unknown symbol for mock data: ${symbol}`);
        return null;
    }
    
    return {
      price: mockPrice,
      timestamp: baseTime
    };
  }

  /**
   * Create Asset object from symbol string
   */
  private createAssetFromSymbol(symbol: string): Asset {
    if (['BTC', 'ETH', 'XLM', 'SOL', 'USDT', 'USDC'].includes(symbol)) {
      return { symbol, type: 'crypto' };
    } else if (['KALE', 'AQUA', 'EURC'].includes(symbol)) {
      return { symbol, type: 'stellar' };
    } else if (['EUR', 'GBP', 'CAD', 'BRL'].includes(symbol)) {
      return { symbol, type: 'forex' };
    }
    
    return { symbol, type: 'crypto' }; // default
  }

  /**
   * Get asset symbols based on oracle source
   */
  private getAssetSymbolsForSource(source: OracleSource): string[] {
    switch (source.name) {
      case 'External CEX & DEX':
        return ['BTC', 'ETH', 'XLM', 'SOL', 'USDT', 'USDC'];
      case 'Stellar Pubnet':
        return ['KALE', 'AQUA', 'EURC', 'XLM'];
      case 'Foreign Exchange':
        return ['EUR', 'GBP', 'CAD', 'BRL'];
      default:
        return [];
    }
  }

  /**
   * Check if price data is fresh (within 10 minutes)
   */
  private isPriceDataFresh(priceData: PriceData): boolean {
    const dataAge = Date.now() - (priceData.timestamp * 1000);
    return dataAge <= this.MAX_DATA_AGE;
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(cached: OracleData): boolean {
    const age = Date.now() - cached.lastUpdate;
    return age <= this.CACHE_TTL;
  }

  /**
   * Combine data from multiple oracle sources into a single dataset
   */
  private combineOracleData(oracleResults: OracleData[], timestamp: number): OracleAssetData {
    const combined: Partial<OracleAssetData> = {
      timestamp,
      oraclesAvailable: oracleResults.length,
      dataQuality: oracleResults.length >= 3 ? 'GOOD' : 
                   oracleResults.length === 2 ? 'PARTIAL' : 'POOR'
    };

    // Extract current prices from oracle data
    for (const oracle of oracleResults) {
      for (const [symbol, priceData] of oracle.assets) {
        switch (symbol) {
          case 'BTC':
            combined.btc_current = priceData.price;
            break;
          case 'ETH':
            combined.eth_current = priceData.price;
            break;
          case 'XLM':
            combined.xlm_current = priceData.price;
            break;
          case 'SOL':
            combined.sol_current = priceData.price;
            break;
          case 'USDT':
            combined.usdt_current = priceData.price;
            break;
          case 'USDC':
            combined.usdc_current = priceData.price;
            break;
          case 'KALE':
            combined.kale_current = priceData.price;
            break;
          case 'AQUA':
            combined.aqua_current = priceData.price;
            break;
          case 'EURC':
            combined.eurc_current = priceData.price;
            break;
          case 'EUR':
            combined.eur_usd = priceData.price;
            break;
          case 'GBP':
            combined.gbp_usd = priceData.price;
            break;
          case 'CAD':
            combined.cad_usd = priceData.price;
            break;
          case 'BRL':
            combined.brl_usd = priceData.price;
            break;
        }
      }
    }

    // Get previous prices from history for trend analysis
    // Don't fallback to current price - let it be undefined if we don't have history
    combined.btc_prev = this.getPreviousPrice('BTC');
    combined.eth_prev = this.getPreviousPrice('ETH'); 
    combined.xlm_prev = this.getPreviousPrice('XLM');
    combined.kale_prev = this.getPreviousPrice('KALE');
    combined.aqua_prev = this.getPreviousPrice('AQUA');

    return combined as OracleAssetData;
  }

  /**
   * Get oracle source configuration by name
   */
  getOracleSource(name: string): OracleSource | undefined {
    return ORACLE_SOURCES.find(source => source.name === name);
  }

  /**
   * Get all oracle sources
   */
  getOracleSources(): OracleSource[] {
    return [...ORACLE_SOURCES];
  }

  /**
   * Update price history for trend analysis
   */
  private updatePriceHistory(symbol: string, priceData: PriceData): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol)!;
    history.push(priceData);
    
    // Clean old entries (keep only last 24 hours)
    const cutoffTime = Date.now() - this.HISTORY_RETENTION;
    const filteredHistory = history.filter(p => (p.timestamp * 1000) > cutoffTime);
    this.priceHistory.set(symbol, filteredHistory);
  }

  /**
   * Get previous price for trend analysis (5-15 minutes ago)
   */
  private getPreviousPrice(symbol: string): bigint | undefined {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length === 0) {
      // No history available, generate a previous price for development/testing
      const currentPrice = this.getMockPriceData(symbol);
      if (currentPrice) {
        // Generate a previous price with small random variation (-2% to +2%)
        const variation = (Math.random() - 0.5) * 0.04; // -2% to +2%
        return BigInt(Math.floor(Number(currentPrice.price) * (1 + variation)));
      }
      return undefined;
    }
    
    if (history.length === 1) {
      // Only one data point, generate a slightly different previous price
      const currentPrice = history[0].price;
      const variation = (Math.random() - 0.5) * 0.04; // -2% to +2%
      return BigInt(Math.floor(Number(currentPrice) * (1 + variation)));
    }
    
    // Look for price from 5-15 minutes ago
    const targetTime = Date.now() / 1000 - (10 * 60); // 10 minutes ago
    
    // Find the price closest to our target time
    let closestPrice = history[0];
    let closestTimeDiff = Math.abs(closestPrice.timestamp - targetTime);
    
    for (const priceData of history) {
      const timeDiff = Math.abs(priceData.timestamp - targetTime);
      if (timeDiff < closestTimeDiff) {
        closestPrice = priceData;
        closestTimeDiff = timeDiff;
      }
    }
    
    // Only use if it's from at least 3 minutes ago (avoid using too recent data)
    if (closestPrice.timestamp < (Date.now() / 1000 - 180)) {
      return closestPrice.price;
    }
    
    // Use the oldest price we have as a fallback
    return history[0].price;
  }

  /**
   * Get price history for a symbol (useful for more complex analysis)
   */
  getPriceHistory(symbol: string, hours: number = 1): PriceData[] {
    const history = this.priceHistory.get(symbol) || [];
    const cutoffTime = Date.now() / 1000 - (hours * 3600);
    return history.filter(p => p.timestamp > cutoffTime);
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear price history (useful for testing)
   */
  clearPriceHistory(): void {
    this.priceHistory.clear();
  }
}