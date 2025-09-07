// Block Data Fetcher - Gets block data from Stellar contract
// Based on the pattern from ref/block-monitor.ts

import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { Server, Durability } from '@stellar/stellar-sdk/rpc';
import type { KaleBlock, KalePail, ContractData } from './block-types';

export class BlockDataFetcher {
  private rpcServer: Server;
  private contractId: string;

  constructor(rpcUrl: string, contractId: string) {
    this.rpcServer = new Server(rpcUrl);
    this.contractId = contractId;
  }

  /**
   * Get current contract data (index, block, pail) - following ref/block-monitor.ts pattern
   */
  async getContractData(): Promise<ContractData> {
    let index = 0;
    let block: KaleBlock | undefined;
    let pail: KalePail | undefined;

    try {
      // Get farm index
      index = await this.getIndex();
      
      // Get block data if index > 0
      if (index > 0) {
        block = await this.getBlock(index);
        // Note: We don't get pail data in oracle system as we don't have a specific farmer address
      }
    } catch (error) {
      console.error('Error getting contract data:', error);
      // Log but don't throw - allow partial data
    }

    return { index, block, pail };
  }

  /**
   * Get specific block data by index
   */
  async getBlockData(blockIndex: number): Promise<KaleBlock | undefined> {
    // Check if we're in development mode with placeholder contract ID
    if (this.contractId === 'mock-contract-id' || this.contractId === 'your-contract-id-here') {
      console.log(`Using mock block data for development (blockIndex: ${blockIndex})`);
      return this.generateMockBlockData(blockIndex);
    }

    try {
      return await this.getBlock(blockIndex);
    } catch (error) {
      console.error(`Failed to get block data for index ${blockIndex}:`, error);
      // Fallback to mock data in case of error
      console.log('Falling back to mock block data due to error');
      return this.generateMockBlockData(blockIndex);
    }
  }

  /**
   * Generate mock block data for development/testing
   */
  private generateMockBlockData(blockIndex: number): KaleBlock {
    const timestamp = BigInt(Math.floor(Date.now() / 1000 - Math.floor(Math.random() * 3600))); // Random timestamp within last hour  
    const entropy = Buffer.from(Math.random().toString(36).substring(2, 18).padEnd(32, '0'), 'utf8');
    
    return {
      index: blockIndex,
      timestamp,
      min_gap: BigInt(10),
      min_stake: BigInt(1000 * 10**7), // 1000 KALE
      min_zeros: BigInt(4),
      max_gap: BigInt(100),
      max_stake: BigInt(10000 * 10**7), // 10000 KALE
      max_zeros: BigInt(8),
      entropy,
      staked_total: BigInt(50000 * 10**7), // 50000 KALE total staked
      normalized_total: BigInt(45000 * 10**7) // 45000 KALE normalized
    };
  }

  /**
   * Get current farm index from contract
   */
  private async getIndex(): Promise<number> {
    const response = await this.rpcServer.getContractData(
      this.contractId,
      xdr.ScVal.scvLedgerKeyContractInstance()
    );

    const storage = response.val
      .contractData()
      .val()
      .instance()
      .storage();

    let index = 0;
    storage?.forEach((entry) => {
      const key: string = scValToNative(entry.key())[0];
      if (key === 'FarmIndex') {
        index = entry.val().u32();
      }
    });

    return index;
  }

  /**
   * Get block data for specific index
   */
  private async getBlock(index: number): Promise<KaleBlock | undefined> {
    try {
      const response = await this.rpcServer.getContractData(
        this.contractId, 
        xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol('Block'),
          xdr.ScVal.scvU32(index)
        ]), 
        Durability.Temporary
      );

      const blockData = scValToNative(response.val.contractData().val());
      return {
        index,
        ...blockData
      } as KaleBlock;
    } catch (error) {
      console.error(`Failed to get block data for index ${index}:`, error);
      return undefined;
    }
  }

  /**
   * Check if we have a valid contract connection
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getIndex();
      return true;
    } catch (error) {
      console.error('Block fetcher connection check failed:', error);
      return false;
    }
  }
}