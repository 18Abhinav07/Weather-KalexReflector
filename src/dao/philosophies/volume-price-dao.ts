// Volume-Price DAO Philosophy
// Price volatility patterns as volume proxy. GOOD if high volatility with directional bias

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class VolumePriceDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate volatility (proxy for volume) and price direction for major assets
      const btcAnalysis = this.calculateVolumePriceAnalysis(data.btc_current, data.btc_prev);
      const ethAnalysis = this.calculateVolumePriceAnalysis(data.eth_current, data.eth_prev);
      const xlmAnalysis = this.calculateVolumePriceAnalysis(data.xlm_current, data.xlm_prev);
      
      const analyses = [
        { asset: 'BTC', ...btcAnalysis },
        { asset: 'ETH', ...ethAnalysis },
        { asset: 'XLM', ...xlmAnalysis }
      ].filter(a => a.volatility !== null && a.direction !== null);

      // Count assets with high volume-price signals (high volatility + clear direction)
      const strongSignals = analyses.filter(a => 
        a.volatility! > 0.015 && Math.abs(a.direction!) > 0.01 // >1.5% volatility + >1% direction
      ).length;
      
      // Count assets with consistent directional bias
      const positiveSignals = analyses.filter(a => a.direction! > 0.01).length;
      const negativeSignals = analyses.filter(a => a.direction! < -0.01).length;
      const dominantDirection = Math.max(positiveSignals, negativeSignals);
      
      // Prediction: GOOD if 2+ strong signals with dominant direction
      const prediction = strongSignals >= 2 && dominantDirection >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on signal strength and consistency
      const avgVolatility = analyses.reduce((sum, a) => sum + a.volatility!, 0) / analyses.length;
      const directionConsistency = dominantDirection / analyses.length;
      const confidence = Math.min(0.9, Math.max(0.3, (avgVolatility * 20) + (directionConsistency * 0.5)));
      
      const reasoning = this.buildReasoning(analyses, strongSignals, dominantDirection, prediction);
      
      return {
        daoId: 'volume-price',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'volume-price',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in volume-price analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate volume-price analysis (volatility as volume proxy + price direction)
   */
  private calculateVolumePriceAnalysis(current?: bigint, previous?: bigint): {volatility: number | null, direction: number | null} {
    if (!current || !previous || previous === 0n) {
      return { volatility: null, direction: null };
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    const direction = (currentNum - previousNum) / previousNum; // Price direction
    const volatility = Math.abs(direction); // Volatility (proxy for volume activity)
    
    return { volatility, direction };
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    analyses: Array<{asset: string, volatility: number | null, direction: number | null}>, 
    strongSignals: number,
    dominantDirection: number,
    prediction: WeatherOutcome
  ): string {
    const analysisDetails = analyses
      .map(a => {
        const vol = a.volatility ? `${(a.volatility * 100).toFixed(2)}%` : 'N/A';
        const dir = a.direction ? (a.direction > 0 ? '+' : '') + `${(a.direction * 100).toFixed(2)}%` : 'N/A';
        return `${a.asset}:${vol}vol,${dir}dir`;
      })
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Volume-Price: ${analysisDetails}. ${strongSignals}/3 strong signals, ${dominantDirection}/3 directional. Prediction: ${predictionText}`;
  }
}