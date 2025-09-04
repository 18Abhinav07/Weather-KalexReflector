// Crypto Momentum DAO Philosophy
// Tracks BTC/ETH/XLM 5-minute momentum. GOOD if 2+ assets show >1% positive movement

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class CryptoMomentumDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate 5-minute momentum for BTC, ETH, XLM
      const btc5min = this.calculateMomentum(data.btc_current, data.btc_prev);
      const eth5min = this.calculateMomentum(data.eth_current, data.eth_prev);
      const xlm5min = this.calculateMomentum(data.xlm_current, data.xlm_prev);
      
      const momentums = [
        { asset: 'BTC', momentum: btc5min },
        { asset: 'ETH', momentum: eth5min },
        { asset: 'XLM', momentum: xlm5min }
      ].filter(m => m.momentum !== null);

      // Count assets with positive momentum >1%
      const positiveMomentum = momentums.filter(m => m.momentum! > 0.01).length;
      
      // Prediction logic: GOOD if 2 or more assets have >1% positive momentum
      const prediction = positiveMomentum >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Calculate confidence based on strength of signals
      const avgMomentum = momentums.reduce((sum, m) => sum + Math.abs(m.momentum!), 0) / momentums.length;
      const confidence = Math.min(0.9, Math.max(0.3, avgMomentum * 10)); // Scale to 0.3-0.9 range
      
      const reasoning = this.buildReasoning(momentums, positiveMomentum, prediction);
      
      return {
        daoId: 'crypto-momentum',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'crypto-momentum',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in momentum calculation: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate momentum percentage change
   */
  private calculateMomentum(current?: bigint, previous?: bigint): number | null {
    if (!current || !previous || previous === 0n) {
      return null;
    }

    // Convert to numbers for calculation (assuming 14 decimal precision)
    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    return (currentNum - previousNum) / previousNum;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    momentums: Array<{asset: string, momentum: number | null}>, 
    positiveMomentum: number, 
    prediction: WeatherOutcome
  ): string {
    const momentumDetails = momentums
      .map(m => `${m.asset}: ${m.momentum ? (m.momentum * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `5-min momentum: ${momentumDetails}. ${positiveMomentum}/3 assets with >1% positive momentum. Prediction: ${predictionText}`;
  }
}