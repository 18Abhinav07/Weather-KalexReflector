// Regional Token DAO Philosophy
// EUR/GBP/CAD/BRL performance. GOOD if emerging markets stable, BAD if stress

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class RegionalTokenDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Analyze regional currency performance vs USD
      const eurPerformance = this.calculateCurrencyPerformance(data.eur_usd);
      const gbpPerformance = this.calculateCurrencyPerformance(data.gbp_usd);
      const cadPerformance = this.calculateCurrencyPerformance(data.cad_usd);
      const brlPerformance = this.calculateCurrencyPerformance(data.brl_usd);
      
      const currencies = [
        { currency: 'EUR', performance: eurPerformance, threshold: 0.02 }, // 2% EUR threshold
        { currency: 'GBP', performance: gbpPerformance, threshold: 0.02 }, // 2% GBP threshold  
        { currency: 'CAD', performance: cadPerformance, threshold: 0.03 }, // 3% CAD threshold
        { currency: 'BRL', performance: brlPerformance, threshold: 0.05 }  // 5% BRL threshold (more volatile)
      ];

      // Count currencies under stress (below negative threshold)
      const stressedCount = currencies.filter(c => 
        c.performance !== null && c.performance < -c.threshold
      ).length;
      
      // Prediction: BAD if 2+ currencies under stress (regional instability)
      const prediction = stressedCount >= 2 ? WeatherOutcome.BAD : WeatherOutcome.GOOD;
      
      // Confidence based on severity of regional stress
      const avgStress = currencies
        .filter(c => c.performance !== null)
        .reduce((sum, c) => sum + Math.min(0, c.performance!), 0) / 4; // Only negative values
      const confidence = Math.min(0.9, Math.max(0.3, 0.6 + (avgStress * 5))); // Higher stress = higher confidence in BAD
      
      const reasoning = this.buildReasoning(currencies, stressedCount, prediction);
      
      return {
        daoId: 'regional-token',
        prediction,
        confidence,
        dataUsed: ['EUR', 'GBP', 'CAD', 'BRL'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'regional-token',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in regional token analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate currency performance (relative to expected trading range)
   */
  private calculateCurrencyPerformance(current?: bigint): number | null {
    if (!current) return null;
    
    const currentNum = Number(current) / 10**14;
    
    // Use historical typical values as baseline for performance calculation
    let baseline: number;
    if (currentNum > 1.5) { // EUR range
      baseline = 1.08; // EUR/USD typical
    } else if (currentNum > 1.2) { // GBP range  
      baseline = 1.27; // GBP/USD typical
    } else if (currentNum < 0.25) { // BRL range
      baseline = 0.19; // BRL/USD typical
    } else { // CAD range
      baseline = 0.74; // CAD/USD typical
    }
    
    return (currentNum - baseline) / baseline;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    currencies: Array<{currency: string, performance: number | null, threshold: number}>, 
    stressedCount: number, 
    prediction: WeatherOutcome
  ): string {
    const performanceDetails = currencies
      .map(c => `${c.currency}: ${c.performance ? (c.performance * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Regional currencies: ${performanceDetails}. ${stressedCount}/4 currencies under stress. Prediction: ${predictionText}`;
  }
}