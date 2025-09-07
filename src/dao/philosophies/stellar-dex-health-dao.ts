// Stellar DEX Health DAO Philosophy
// Stellar ecosystem tokens health. GOOD if Stellar native assets performing well

// Stellar DEX Health DAO Philosophy
// Stellar ecosystem tokens health. GOOD if Stellar native assets performing well
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class StellarDEXHealthDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Analyze Stellar ecosystem assets
      const xlmPerformance = this.calculatePerformance(data.xlm_current, data.xlm_prev);
      const kalePerformance = this.calculatePerformance(data.kale_current, data.kale_prev);
      const aquaPerformance = this.calculatePerformance(data.aqua_current, data.aqua_prev);
      const eurcPerformance = this.calculatePerformance(data.eurc_current, data.eurc_current); // EURC stability check
      
      const performances = [
        { asset: 'XLM', performance: xlmPerformance },
        { asset: 'KALE', performance: kalePerformance },
        { asset: 'AQUA', performance: aquaPerformance },
        { asset: 'EURC', performance: eurcPerformance }
      ].filter(p => p.performance !== null);

      // Count assets with positive or stable performance (>-2%)
      const healthyAssetCount = performances.filter(p => p.performance! > -0.02).length;
      
      // Prediction: GOOD if 3+ Stellar assets healthy
      const prediction = healthyAssetCount >= 3 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on overall Stellar ecosystem performance
      const avgPerformance = performances.reduce((sum, p) => sum + p.performance!, 0) / performances.length;
      const confidence = Math.min(0.9, Math.max(0.3, 0.5 + (avgPerformance * 5))); // Higher confidence for positive performance
      
      const reasoning = this.buildReasoning(performances, healthyAssetCount, prediction);
      
      return {
        daoId: 'stellar-dex-health',
        prediction,
        confidence,
        dataUsed: ['XLM', 'KALE', 'AQUA', 'EURC'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'stellar-dex-health',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in Stellar DEX health analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate asset performance (price change percentage)
   */
  private calculatePerformance(current?: bigint, previous?: bigint): number | null {
    if (!current) return null;
    if (!previous || previous === 0n) {
      // For assets without previous data, assume neutral performance
      return 0.0;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    return (currentNum - previousNum) / previousNum;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    performances: Array<{asset: string, performance: number | null}>, 
    healthyAssetCount: number, 
    prediction: WeatherOutcome
  ): string {
    const performanceDetails = performances
      .map(p => `${p.asset}: ${p.performance ? (p.performance * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Stellar DEX: ${performanceDetails}. ${healthyAssetCount}/${performances.length} assets healthy (>-2%). Prediction: ${predictionText}`;
  }
}