// Stablecoin Peg DAO Philosophy
// USDT/USDC deviation from $1.00. GOOD if stablecoins maintaining peg (market stability)

import { DAOPhilosophy } from '../dao-registry';
import { OracleAssetData, DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class StablecoinPegDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate deviations from $1.00 peg
      const usdtDeviation = this.calculatePegDeviation(data.usdt_current);
      const usdcDeviation = this.calculatePegDeviation(data.usdc_current);
      
      const stablecoins = [
        { coin: 'USDT', deviation: usdtDeviation },
        { coin: 'USDC', deviation: usdcDeviation }
      ].filter(s => s.deviation !== null);

      // Count stablecoins maintaining tight peg (<0.5% deviation)
      const stablePegCount = stablecoins.filter(s => s.deviation! < 0.005).length;
      
      // Check for severe depeg events (>2% deviation) 
      const depegEvents = stablecoins.filter(s => s.deviation! > 0.02).length;
      
      // Prediction: BAD if any depeg events, otherwise GOOD if both maintaining peg
      const prediction = depegEvents > 0 ? WeatherOutcome.BAD : 
                        stablePegCount >= 2 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on severity of peg deviations
      const maxDeviation = Math.max(...stablecoins.map(s => s.deviation!));
      const confidence = Math.min(0.9, Math.max(0.3, 0.9 - (maxDeviation * 50))); // Higher deviation = higher confidence in prediction
      
      const reasoning = this.buildReasoning(stablecoins, stablePegCount, depegEvents, prediction);
      
      return {
        daoId: 'stablecoin-peg',
        prediction,
        confidence,
        dataUsed: ['USDT', 'USDC'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'stablecoin-peg',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in stablecoin peg analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate deviation from $1.00 peg
   */
  private calculatePegDeviation(current?: bigint): number | null {
    if (!current) return null;
    
    const currentNum = Number(current) / 10**14;
    const targetPeg = 1.0; // $1.00 target
    
    return Math.abs((currentNum - targetPeg) / targetPeg);
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    stablecoins: Array<{coin: string, deviation: number | null}>, 
    stablePegCount: number,
    depegEvents: number,
    prediction: WeatherOutcome
  ): string {
    const pegDetails = stablecoins
      .map(s => {
        const deviation = s.deviation! * 100;
        const status = deviation > 2 ? 'DEPEG' : deviation > 0.5 ? 'LOOSE' : 'STABLE';
        return `${s.coin}: ${deviation.toFixed(3)}% (${status})`;
      })
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    let summary = `${stablePegCount}/2 stable pegs`;
    if (depegEvents > 0) {
      summary += `, ${depegEvents} depeg events`;
    }
    
    return `Stablecoin pegs: ${pegDetails}. ${summary}. Prediction: ${predictionText}`;
  }
}