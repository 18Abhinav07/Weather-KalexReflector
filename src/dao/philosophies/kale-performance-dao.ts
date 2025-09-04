// KALE Performance DAO Philosophy
// Tracks KALE/USDC price trend. GOOD if KALE up >2% in 15min, BAD if down >2%

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class KalePerformanceDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate KALE/USDC performance
      const kalePerformance = this.calculateKalePerformance(data.kale_current, data.kale_prev, data.usdc_current);
      
      if (kalePerformance === null) {
        return {
          daoId: 'kale-performance',
          prediction: WeatherOutcome.BAD,
          confidence: 0.1,
          dataUsed: [],
          reasoning: 'Insufficient KALE or USDC price data available',
          processingTime: Date.now() - startTime
        };
      }

      // Prediction logic based on 2% threshold
      let prediction: WeatherOutcome;
      let confidence: number;
      
      if (kalePerformance > 0.02) {
        // KALE up >2% - GOOD weather
        prediction = WeatherOutcome.GOOD;
        confidence = Math.min(0.95, 0.6 + (kalePerformance * 5)); // Higher confidence with stronger performance
      } else if (kalePerformance < -0.02) {
        // KALE down >2% - BAD weather
        prediction = WeatherOutcome.BAD;
        confidence = Math.min(0.95, 0.6 + (Math.abs(kalePerformance) * 5));
      } else {
        // KALE movement within ±2% - lean towards BAD (neutral/weak signal)
        prediction = WeatherOutcome.BAD;
        confidence = 0.3 + (Math.abs(kalePerformance) * 10); // Lower confidence for weak signals
      }

      const reasoning = this.buildReasoning(kalePerformance, prediction);
      
      return {
        daoId: 'kale-performance',
        prediction,
        confidence: Math.min(0.95, Math.max(0.2, confidence)),
        dataUsed: ['KALE', 'USDC'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'kale-performance',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in KALE performance calculation: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate KALE performance against USDC
   */
  private calculateKalePerformance(kaleCurrent?: bigint, kalePrev?: bigint, usdc?: bigint): number | null {
    if (!kaleCurrent || !kalePrev || !usdc || kalePrev === 0n) {
      return null;
    }

    // Convert to numbers for calculation (assuming 14 decimal precision)
    const kaleCurrentNum = Number(kaleCurrent) / 10**14;
    const kalePrevNum = Number(kalePrev) / 10**14;
    
    // Calculate KALE price change
    const kaleChange = (kaleCurrentNum - kalePrevNum) / kalePrevNum;
    
    return kaleChange;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(kalePerformance: number, prediction: WeatherOutcome): string {
    const performancePercent = (kalePerformance * 100).toFixed(2);
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    let signal: string;
    if (kalePerformance > 0.02) {
      signal = 'strong positive';
    } else if (kalePerformance < -0.02) {
      signal = 'strong negative';
    } else if (kalePerformance > 0) {
      signal = 'weak positive';
    } else {
      signal = 'weak negative';
    }
    
    return `KALE/USDC 15-min performance: ${performancePercent}% (${signal}). Threshold: ±2%. Prediction: ${predictionText}`;
  }
}