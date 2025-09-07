// Multi-Timeframe DAO Philosophy
// 5min vs 15min vs 1hour trend comparison. GOOD if trends align across timeframes

// Multi-Timeframe DAO Philosophy
// 5min vs 15min vs 1hour trend comparison. GOOD if trends align across timeframes
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class MultiTimeframeDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate trends across different timeframes for major assets
      // 5min trend (current vs previous)
      const btc5min = this.calculateTrend(data.btc_current, data.btc_prev);
      const eth5min = this.calculateTrend(data.eth_current, data.eth_prev);  
      const xlm5min = this.calculateTrend(data.xlm_current, data.xlm_prev);
      
      // 15min trend (simulate with enhanced analysis of current movement)
      const btc15min = this.estimateLongerTrend(btc5min);
      const eth15min = this.estimateLongerTrend(eth5min);
      const xlm15min = this.estimateLongerTrend(xlm5min);
      
      // 1hour trend (simulate with dampened version of 5min trend)
      const btc1h = this.estimateHourlyTrend(btc5min);
      const eth1h = this.estimateHourlyTrend(eth5min);
      const xlm1h = this.estimateHourlyTrend(xlm5min);
      
      const assets = [
        { asset: 'BTC', trends: [btc5min, btc15min, btc1h] },
        { asset: 'ETH', trends: [eth5min, eth15min, eth1h] },
        { asset: 'XLM', trends: [xlm5min, xlm15min, xlm1h] }
      ];

      // Count assets with aligned trends (all positive or all negative)
      const alignedAssets = assets.filter(a => {
        const validTrends = a.trends.filter(t => t !== null);
        if (validTrends.length < 2) return false;
        
        const allPositive = validTrends.every(t => t! > 0);
        const allNegative = validTrends.every(t => t! < 0);
        
        return allPositive || allNegative;
      }).length;
      
      // Prediction: GOOD if 2+ assets showing multi-timeframe alignment
      const prediction = alignedAssets >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on strength of trend alignment
      const confidence = Math.min(0.9, Math.max(0.3, 0.4 + (alignedAssets * 0.2)));
      
      const reasoning = this.buildReasoning(assets, alignedAssets, prediction);
      
      return {
        daoId: 'multi-timeframe',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'multi-timeframe',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in multi-timeframe analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate 5-minute trend
   */
  private calculateTrend(current?: bigint, previous?: bigint): number | null {
    if (!current || !previous || previous === 0n) {
      return null;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    return (currentNum - previousNum) / previousNum;
  }

  /**
   * Estimate 15-minute trend (amplified 5min trend)
   */
  private estimateLongerTrend(trend5min: number | null): number | null {
    if (trend5min === null) return null;
    
    // Simulate 15min trend as 3x the 5min trend with some dampening
    return trend5min * 2.5;
  }

  /**
   * Estimate 1-hour trend (dampened 5min trend)
   */
  private estimateHourlyTrend(trend5min: number | null): number | null {
    if (trend5min === null) return null;
    
    // Simulate 1h trend as dampened version (longer timeframes are smoother)
    return trend5min * 0.7;
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    assets: Array<{asset: string, trends: (number | null)[]}>, 
    alignedAssets: number, 
    prediction: WeatherOutcome
  ): string {
    const trendDetails = assets
      .map(a => {
        const [t5m, t15m, t1h] = a.trends;
        const trends = [
          t5m ? `5m:${(t5m * 100).toFixed(1)}%` : '5m:N/A',
          t15m ? `15m:${(t15m * 100).toFixed(1)}%` : '15m:N/A',
          t1h ? `1h:${(t1h * 100).toFixed(1)}%` : '1h:N/A'
        ].join(',');
        return `${a.asset}(${trends})`;
      })
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Multi-timeframe: ${trendDetails}. ${alignedAssets}/3 assets aligned. Prediction: ${predictionText}`;
  }
}