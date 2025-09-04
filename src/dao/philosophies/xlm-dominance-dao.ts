// XLM Dominance DAO Philosophy  
// Compares XLM performance vs BTC/ETH. GOOD if XLM outperforming >5%

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class XlmDominanceDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate relative performance of XLM vs BTC and ETH
      const xlmVsBtc = this.calculateRelativePerformance(
        data.xlm_current, data.xlm_prev,
        data.btc_current, data.btc_prev
      );
      
      const xlmVsEth = this.calculateRelativePerformance(
        data.xlm_current, data.xlm_prev,
        data.eth_current, data.eth_prev
      );

      const performances = [
        { pair: 'XLM/BTC', performance: xlmVsBtc },
        { pair: 'XLM/ETH', performance: xlmVsEth }
      ].filter(p => p.performance !== null);

      if (performances.length === 0) {
        return {
          daoId: 'xlm-dominance',
          prediction: WeatherOutcome.BAD,
          confidence: 0.1,
          dataUsed: [],
          reasoning: 'Insufficient price data for XLM dominance analysis',
          processingTime: Date.now() - startTime
        };
      }

      // Check if XLM is outperforming by >5% in either comparison
      const strongOutperformance = performances.filter(p => p.performance! > 0.05);
      const avgPerformance = performances.reduce((sum, p) => sum + p.performance!, 0) / performances.length;
      
      // Prediction logic: GOOD if XLM outperforming >5% vs BTC or ETH
      const prediction = strongOutperformance.length > 0 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Calculate confidence based on strength and consistency of outperformance
      let confidence: number;
      if (strongOutperformance.length > 0) {
        const maxOutperformance = Math.max(...strongOutperformance.map(p => p.performance!));
        confidence = Math.min(0.95, 0.7 + (maxOutperformance * 2)); // Higher confidence with stronger dominance
      } else {
        // Even if not strongly outperforming, give some confidence based on relative performance
        confidence = Math.max(0.2, 0.5 - Math.abs(avgPerformance * 2));
      }
      
      const reasoning = this.buildReasoning(performances, avgPerformance, prediction);
      
      return {
        daoId: 'xlm-dominance',
        prediction,
        confidence: Math.min(0.95, Math.max(0.2, confidence)),
        dataUsed: ['XLM', 'BTC', 'ETH'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'xlm-dominance',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in XLM dominance analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate relative performance of asset1 vs asset2
   * Returns how much better/worse asset1 performed compared to asset2
   */
  private calculateRelativePerformance(
    asset1Current?: bigint, asset1Prev?: bigint,
    asset2Current?: bigint, asset2Prev?: bigint
  ): number | null {
    if (!asset1Current || !asset1Prev || !asset2Current || !asset2Prev || 
        asset1Prev === 0n || asset2Prev === 0n) {
      return null;
    }

    // Convert to numbers for calculation (assuming 14 decimal precision)
    const asset1CurrentNum = Number(asset1Current) / 10**14;
    const asset1PrevNum = Number(asset1Prev) / 10**14;
    const asset2CurrentNum = Number(asset2Current) / 10**14;
    const asset2PrevNum = Number(asset2Prev) / 10**14;
    
    // Calculate individual performance
    const asset1Performance = (asset1CurrentNum - asset1PrevNum) / asset1PrevNum;
    const asset2Performance = (asset2CurrentNum - asset2PrevNum) / asset2PrevNum;
    
    // Return relative outperformance (positive means asset1 outperformed asset2)
    return asset1Performance - asset2Performance;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    performances: Array<{pair: string, performance: number | null}>,
    avgPerformance: number,
    prediction: WeatherOutcome
  ): string {
    const performanceDetails = performances
      .map(p => `${p.pair}: ${p.performance ? (p.performance * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const avgPercent = (avgPerformance * 100).toFixed(2);
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    const strongOutperformance = performances.filter(p => p.performance! > 0.05).length;
    
    return `XLM relative performance: ${performanceDetails}. Average: ${avgPercent}%. Strong outperformance (>5%): ${strongOutperformance}/2 pairs. Prediction: ${predictionText}`;
  }
}