// Correlation Breakdown DAO Philosophy
// Asset correlation changes. GOOD if traditional correlations breaking down (diversification opportunity)

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class CorrelationBreakdownDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate performance for different asset classes
      const btcPerf = this.calculatePerformance(data.btc_current, data.btc_prev);
      const ethPerf = this.calculatePerformance(data.eth_current, data.eth_prev);
      const xlmPerf = this.calculatePerformance(data.xlm_current, data.xlm_prev);
      const eurPerf = this.calculatePerformance(data.eur_usd, 1.08 * 10**14); // vs typical EUR baseline
      
      // Calculate correlation breakdown signals
      const cryptoCorrelation = this.calculateCorrelation(btcPerf, ethPerf); // BTC-ETH correlation
      const cryptoForexDivergence = this.calculateDivergence(btcPerf, eurPerf); // Crypto vs Forex
      const stellarDivergence = this.calculateDivergence(xlmPerf, btcPerf); // Stellar vs Bitcoin
      
      const breakdowns = [
        { pair: 'BTC-ETH', correlation: cryptoCorrelation },
        { pair: 'Crypto-Forex', divergence: cryptoForexDivergence },
        { pair: 'XLM-BTC', divergence: stellarDivergence }
      ];

      // Count correlation breakdowns (low correlation or high divergence)
      const breakdownCount = breakdowns.filter(b => 
        (b.correlation !== null && Math.abs(b.correlation) < 0.5) ||
        (b.divergence !== undefined && Math.abs(b.divergence) > 0.03)
      ).length;
      
      // Prediction: GOOD if 2+ correlation breakdowns (diversification opportunity)
      const prediction = breakdownCount >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on strength of breakdowns
      const confidence = Math.min(0.9, Math.max(0.3, 0.4 + (breakdownCount * 0.2)));
      
      const reasoning = this.buildReasoning(breakdowns, breakdownCount, prediction);
      
      return {
        daoId: 'correlation-breakdown',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM', 'EUR'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'correlation-breakdown',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in correlation breakdown analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate asset performance
   */
  private calculatePerformance(current?: bigint, previous?: bigint | number): number | null {
    if (!current) return null;
    
    const currentNum = Number(current) / 10**14;
    const previousNum = typeof previous === 'number' ? previous / 10**14 : 
                       previous ? Number(previous) / 10**14 : null;
    
    if (!previousNum || previousNum === 0) return null;
    
    return (currentNum - previousNum) / previousNum;
  }

  /**
   * Calculate correlation between two performance values
   */
  private calculateCorrelation(perf1: number | null, perf2: number | null): number | null {
    if (perf1 === null || perf2 === null) return null;
    
    // Simple correlation approximation: if both move in same direction, correlation is high
    if ((perf1 > 0 && perf2 > 0) || (perf1 < 0 && perf2 < 0)) {
      return 0.8; // High positive correlation
    } else {
      return -0.3; // Negative correlation (breakdown signal)
    }
  }

  /**
   * Calculate divergence between two asset classes
   */
  private calculateDivergence(perf1: number | null, perf2: number | null): number {
    if (perf1 === null || perf2 === null) return 0;
    
    return Math.abs(perf1 - perf2);
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    breakdowns: Array<{pair: string, correlation?: number | null, divergence?: number}>, 
    breakdownCount: number, 
    prediction: WeatherOutcome
  ): string {
    const breakdownDetails = breakdowns
      .map(b => {
        if (b.correlation !== undefined) {
          return `${b.pair}: ${b.correlation?.toFixed(2) || 'N/A'} correlation`;
        } else {
          return `${b.pair}: ${(b.divergence! * 100).toFixed(2)}% divergence`;
        }
      })
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Correlation analysis: ${breakdownDetails}. ${breakdownCount}/3 breakdowns detected. Prediction: ${predictionText}`;
  }
}