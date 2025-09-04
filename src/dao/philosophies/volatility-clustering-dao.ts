// Volatility Clustering DAO Philosophy
// Standard deviation calculation over 15 minutes. GOOD if low volatility (stable market)

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class VolatilityClusteringDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate volatility for major assets (using current vs previous as proxy)
      const btcVolatility = this.calculateVolatility(data.btc_current, data.btc_prev);
      const ethVolatility = this.calculateVolatility(data.eth_current, data.eth_prev);
      const xlmVolatility = this.calculateVolatility(data.xlm_current, data.xlm_prev);
      
      const volatilities = [
        { asset: 'BTC', volatility: btcVolatility },
        { asset: 'ETH', volatility: ethVolatility },
        { asset: 'XLM', volatility: xlmVolatility }
      ].filter(v => v.volatility !== null);

      // Count assets with low volatility (<3% movement)
      const lowVolatilityCount = volatilities.filter(v => Math.abs(v.volatility!) < 0.03).length;
      
      // Prediction: GOOD if 2+ assets showing low volatility (stable market)
      const prediction = lowVolatilityCount >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on volatility clustering
      const avgVolatility = volatilities.reduce((sum, v) => sum + Math.abs(v.volatility!), 0) / volatilities.length;
      const confidence = Math.min(0.9, Math.max(0.3, 1 - (avgVolatility * 10))); // Inverse of volatility
      
      const reasoning = this.buildReasoning(volatilities, lowVolatilityCount, prediction);
      
      return {
        daoId: 'volatility-clustering',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'volatility-clustering',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in volatility analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate volatility (absolute price change percentage)
   */
  private calculateVolatility(current?: bigint, previous?: bigint): number | null {
    if (!current || !previous || previous === 0n) {
      return null;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    return Math.abs((currentNum - previousNum) / previousNum);
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    volatilities: Array<{asset: string, volatility: number | null}>, 
    lowVolatilityCount: number, 
    prediction: WeatherOutcome
  ): string {
    const volatilityDetails = volatilities
      .map(v => `${v.asset}: ${v.volatility ? (v.volatility * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Volatility: ${volatilityDetails}. ${lowVolatilityCount}/3 assets low volatility (<3%). Prediction: ${predictionText}`;
  }
}