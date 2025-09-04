// Block types - copied from ref/block-types.ts for the DAO system

export interface KaleBlock {
  index: number;
  timestamp?: bigint;
  min_gap: bigint;
  min_stake: bigint;
  min_zeros: bigint;
  max_gap: bigint;
  max_stake: bigint;
  max_zeros: bigint;
  entropy?: Buffer;
  staked_total?: bigint;
  normalized_total?: bigint;
}

export interface KalePail {
  sequence: bigint;
  gap: bigint | undefined;
  stake: bigint;
  zeros: bigint | undefined;
}

export interface ContractData {
  index: number;
  block: KaleBlock | undefined;
  pail: KalePail | undefined;
}