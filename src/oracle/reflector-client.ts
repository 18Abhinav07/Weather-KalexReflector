// Reflector Oracle Client - Integrates with Stellar Reflector Network
// Based on the Reflector interface from Docs/reflector/howitworks.md

import { Address, SorobanRpc } from '@stellar/stellar-sdk';
// Note: Env type may need different import path in newer SDK versions
type Env = any; // Will be replaced when we implement actual contract calls
type Symbol = string;
type Vec<T> = T[];

const { Server } = SorobanRpc;
import { 
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
  private rpcServer: Server;
  private env: Env;
  private cache: Map<string, OracleData> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly MAX_DATA_AGE = 10 * 60 * 1000; // 10 minutes in milliseconds

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
  private async getLastPrice(contractAddress: Address, asset: Asset): Promise<PriceData | null> {
    // This would be implemented using the Stellar RPC client
    // For now, returning mock data structure
    // TODO: Implement actual Stellar contract call when needed
    
    try {
      // Mock implementation - replace with actual contract call when ready
      // Generate realistic mock prices based on asset type
      let mockPrice: bigint;
      
      switch (asset.symbol) {
        case 'BTC':
          mockPrice = BigInt(Math.floor((45000 + Math.random() * 10000) * 10**14)); // ~$45-55k
          break;
        case 'ETH':
          mockPrice = BigInt(Math.floor((2500 + Math.random() * 1000) * 10**14)); // ~$2.5-3.5k
          break;
        case 'XLM':
          mockPrice = BigInt(Math.floor((0.12 + Math.random() * 0.08) * 10**14)); // ~$0.12-0.20
          break;
        case 'KALE':
          mockPrice = BigInt(Math.floor((0.001 + Math.random() * 0.002) * 10**14)); // ~$0.001-0.003
          break;
        case 'USDC':
        case 'USDT':
          mockPrice = BigInt(Math.floor((0.999 + Math.random() * 0.002) * 10**14)); // ~$0.999-1.001
          break;
        default:
          mockPrice = BigInt(Math.floor(Math.random() * 100) * 10**14);
      }
      
      const mockTimestamp = Math.floor(Date.now() / 1000);
      
      return {
        price: mockPrice,
        timestamp: mockTimestamp
      };
    } catch (error) {
      console.error(`Failed to get price for ${asset.symbol}:`, error);
      return null;
    }
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

    // TODO: Implement historical price fetching for trend analysis
    // For now, using current prices as previous prices (will be replaced with actual historical data)
    combined.btc_prev = combined.btc_current;
    combined.eth_prev = combined.eth_current;
    combined.xlm_prev = combined.xlm_current;
    combined.kale_prev = combined.kale_current;
    combined.aqua_prev = combined.aqua_current;

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
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}