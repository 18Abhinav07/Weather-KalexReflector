// Cross-Chain Stress DAO Philosophy
// Multi-blockchain stress indicators. GOOD if cross-chain assets stable

// Cross-Chain Stress DAO Philosophy
// Multi-blockchain stress indicators. GOOD if cross-chain assets stable
import type { DAOPhilosophy } from '../dao-registry';
import { type OracleAssetData, type DAOAnalysis, WeatherOutcome } from '../../types/oracle-types';

export class CrossChainStressDAO implements DAOPhilosophy {
  
  analyze(data: OracleAssetData): DAOAnalysis {
    const startTime = Date.now();
    
    try {
      // Analyze cross-chain representative assets for stress signals
      const btcStress = this.calculateStressLevel(data.btc_current, data.btc_prev); // Bitcoin network
      const ethStress = this.calculateStressLevel(data.eth_current, data.eth_prev); // Ethereum network
      const xlmStress = this.calculateStressLevel(data.xlm_current, data.xlm_prev); // Stellar network
      const solStress = this.calculateStressLevel(data.sol_current, data.sol_current); // Solana network (using current only as fallback)
      
      const stressLevels = [
        { chain: 'Bitcoin', stress: btcStress },
        { chain: 'Ethereum', stress: ethStress },
        { chain: 'Stellar', stress: xlmStress },
        { chain: 'Solana', stress: solStress }
      ].filter(s => s.stress !== null);

      // Count chains with low stress (<4% volatility)
      const lowStressCount = stressLevels.filter(s => s.stress! < 0.04).length;
      
      // Prediction: GOOD if 3+ chains showing low stress
      const prediction = lowStressCount >= 3 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
      
      // Confidence based on overall cross-chain stability
      const avgStress = stressLevels.reduce((sum, s) => sum + s.stress!, 0) / stressLevels.length;
      const confidence = Math.min(0.9, Math.max(0.3, 1 - (avgStress * 8)));
      
      const reasoning = this.buildReasoning(stressLevels, lowStressCount, prediction);
      
      return {
        daoId: 'cross-chain-stress',
        prediction,
        confidence,
        dataUsed: ['BTC', 'ETH', 'XLM', 'SOL'],
        reasoning,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        daoId: 'cross-chain-stress',
        prediction: WeatherOutcome.BAD,
        confidence: 0.1,
        dataUsed: [],
        reasoning: `Error in cross-chain stress analysis: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate stress level for a chain (based on price volatility)
   */
  private calculateStressLevel(current?: bigint, previous?: bigint): number | null {
    if (!current) return null;
    if (!previous || previous === 0n) {
      // Fallback: assume 1% baseline stress if no previous data
      return 0.01;
    }

    const currentNum = Number(current) / 10**14;
    const previousNum = Number(previous) / 10**14;
    
    return Math.abs((currentNum - previousNum) / previousNum);
  }

  /**
   * Build human-readable reasoning for the decision
   */
  private buildReasoning(
    stressLevels: Array<{chain: string, stress: number | null}>, 
    lowStressCount: number, 
    prediction: WeatherOutcome
  ): string {
    const stressDetails = stressLevels
      .map(s => `${s.chain}: ${s.stress ? (s.stress * 100).toFixed(2) : 'N/A'}%`)
      .join(', ');
    
    const predictionText = prediction === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    
    return `Chain stress levels: ${stressDetails}. ${lowStressCount}/${stressLevels.length} chains low stress (<4%). Prediction: ${predictionText}`;
  }
}