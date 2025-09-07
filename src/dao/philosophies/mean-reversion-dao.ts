// Mean Reversion DAO Philosophy
// Compares current prices to 1-hour average. GOOD if prices reverting to mean

// Mean Reversion DAO Philosophy
// Compares current prices to 1-hour average. GOOD if prices reverting to mean
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class MeanReversionDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate mean reversion signals for major assets
      const btcReversion = this.calculateMeanReversion(data.btc_current, data.btc_prev);
      const ethReversion = this.calculateMeanReversion(data.eth_current, data.eth_prev);
      const xlmReversion = this.calculateMeanReversion(data.xlm_current, data.xlm_prev);
      
      const reversions = [
        { asset: 'BTC', reversion: btcReversion },
        { asset: 'ETH', reversion: ethReversion },
        { asset: 'XLM', reversion: xlmReversion }
      ].filter(r => r.reversion !== null);

      // Count assets showing mean reversion (moving back toward average)
      const reversionCount = reversions.filter(r => Math.abs(r.reversion!) < 0.02).length; // <2% from mean
      
      // Prediction: GOOD if 2+ assets showing mean reversion behavior
      const prediction = reversionCount >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on strength of reversion signals
      const avgReversion = reversions.reduce((sum, r) => sum + Math.abs(r.reversion!), 0) / reversions.length;
      const confidence = Math.min(0.9, Math.max(0.3, 1 - (avgReversion * 5))); // Inverse of volatility
      
      const reasoning = this.buildReasoning(reversions, reversionCount, prediction);
      
      return {
        daoId: 'mean-reversion',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'mean-reversion',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in mean reversion analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate mean reversion (how close current price is to previous price)
   */
  private calculateMeanReversion(current?: bigint, previous?: bigint): number | null {
    if (!current || !previous || previous === 0n) {
      return null;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    // Return deviation from previous (proxy for mean reversion)
    return (currentNum - previousNum) / previousNum;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    reversions: Array<{asset: string, reversion: number | null}>, 
    reversionCount: number, 
    prediction: WeatherOutcome
  ): string {
    const reversionDetails = reversions
      .map(r => `${r.asset}: ${r.reversion ? (Math.abs(r.reversion) * 100).toFixed(2) : 'N/A'}% from mean`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Mean reversion: ${reversionDetails}. ${reversionCount}/3 assets near mean (<2% deviation). Prediction: ${predictionText}`;
  }
}