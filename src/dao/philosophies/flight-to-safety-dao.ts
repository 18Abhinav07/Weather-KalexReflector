// Flight to Safety DAO Philosophy  
// USDT/USDC vs crypto correlation. GOOD if stablecoins outperforming (safe haven flow)

// Flight to Safety DAO Philosophy  
// USDT/USDC vs crypto correlation. GOOD if stablecoins outperforming (safe haven flow)
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class FlightToSafetyDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Calculate stablecoin stability vs crypto volatility
      const usdtStability = this.calculateStability(data.usdt_current);
      const usdcStability = this.calculateStability(data.usdc_current);
      
      // Calculate crypto volatility
      const btcVolatility = this.calculateVolatility(data.btc_current, data.btc_prev);
      const ethVolatility = this.calculateVolatility(data.eth_current, data.eth_prev);
      const xlmVolatility = this.calculateVolatility(data.xlm_current, data.xlm_prev);
      
      const avgCryptoVolatility = [btcVolatility, ethVolatility, xlmVolatility]
        .filter(v => v !== null)
        .reduce((sum, v) => sum + v!, 0) / 3;

      const avgStablecoinStability = [usdtStability, usdcStability]
        .filter(s => s !== null)
        .reduce((sum, s) => sum + s!, 0) / 2;

      // Flight to safety: High crypto volatility + stable stablecoins = GOOD
      const flightToSafetySignal = avgCryptoVolatility > 0.02 && avgStablecoinStability < 0.005;
      const prediction = flightToSafetySignal ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on divergence between crypto volatility and stablecoin stability
      const divergence = Math.abs(avgCryptoVolatility - avgStablecoinStability);
      const confidence = Math.min(0.9, Math.max(0.3, divergence * 50));
      
      const reasoning = this.buildReasoning(avgCryptoVolatility, avgStablecoinStability, prediction);
      
      return {
        daoId: 'flight-to-safety',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM', 'USDT', 'USDC'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'flight-to-safety',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in flight to safety analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate stablecoin stability (deviation from $1.00)
   */
  private calculateStability(current?: bigint): number | null {
    if (!current) return null;
    
    const currentNum = Number(current) / 10**14;
    const targetPrice = 1.0; // $1.00 target for stablecoins
    
    return Math.abs((currentNum - targetPrice) / targetPrice);
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
    avgCryptoVolatility: number,
    avgStablecoinStability: number, 
    prediction: WeatherOutcome
  ): string {
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Crypto volatility: ${(avgCryptoVolatility * 100).toFixed(2)}%, Stablecoin stability: ${(avgStablecoinStability * 100).toFixed(3)}%. Flight to safety signal: ${avgCryptoVolatility > 0.02 && avgStablecoinStability < 0.005}. Prediction: ${predictionText}`;
  }
}