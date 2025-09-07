// Liquidity Premium DAO Philosophy  
// Price differences between oracles for same assets. GOOD if low liquidity premiums (efficient markets)

// Liquidity Premium DAO Philosophy  
// Price differences between oracles for same assets. GOOD if low liquidity premiums (efficient markets)
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class LiquidityPremiumDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate liquidity premiums by comparing asset performance consistency
      // In a liquid market, assets should move more predictably
      const btcConsistency = this.calculatePriceConsistency(data.btc_current, data.btc_prev);
      const ethConsistency = this.calculatePriceConsistency(data.eth_current, data.eth_prev);  
      const xlmConsistency = this.calculatePriceConsistency(data.xlm_current, data.xlm_prev);
      const usdtConsistency = this.calculateStablecoinConsistency(data.usdt_current);
      
      const consistencies = [
        { asset: 'BTC', consistency: btcConsistency },
        { asset: 'ETH', consistency: ethConsistency },
        { asset: 'XLM', consistency: xlmConsistency },
        { asset: 'USDT', consistency: usdtConsistency }
      ].filter(c => c.consistency !== null);

      // Count assets with good liquidity (consistent pricing, low premium)
      const liquidAssetCount = consistencies.filter(c => c.consistency! > 0.7).length; // >0.7 consistency score
      
      // Prediction: GOOD if 3+ assets showing good liquidity
      const prediction = liquidAssetCount >= 3 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on overall market liquidity
      const avgConsistency = consistencies.reduce((sum, c) => sum + c.consistency!, 0) / consistencies.length;
      const confidence = Math.min(0.9, Math.max(0.3, avgConsistency));
      
      const reasoning = this.buildReasoning(consistencies, liquidAssetCount, prediction);
      
      return {
        daoId: 'liquidity-premium',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM', 'USDT'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'liquidity-premium',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in liquidity premium analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate price consistency (inverse of volatility as liquidity proxy)
   */
  private calculatePriceConsistency(current?: bigint, previous?: bigint): number | null {
    if (!current || !previous || previous === 0n) {
      return null;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    const volatility = Math.abs((currentNum - previousNum) / previousNum);
    
    // Convert volatility to consistency score (inverse relationship)
    // Low volatility = high consistency = good liquidity
    return Math.max(0, 1 - (volatility * 20)); // Scale so 5% volatility = 0 consistency
  }

  /**
   * Calculate stablecoin consistency (deviation from $1 as liquidity measure)
   */
  private calculateStablecoinConsistency(current?: bigint): number | null {
    if (!current) return null;
    
    const currentNum = Number(current) / 10**14;
    const deviation = Math.abs(currentNum - 1.0); // Deviation from $1
    
    // Convert deviation to consistency score
    return Math.max(0, 1 - (deviation * 200)); // Scale so 0.5% deviation = 0 consistency
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    consistencies: Array<{asset: string, consistency: number | null}>, 
    liquidAssetCount: number, 
    prediction: WeatherOutcome
  ): string {
    const consistencyDetails = consistencies
      .map(c => `${c.asset}: ${c.consistency ? (c.consistency * 100).toFixed(0) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Liquidity consistency: ${consistencyDetails}. ${liquidAssetCount}/${consistencies.length} assets liquid (>70%). Prediction: ${predictionText}`;
  }
}