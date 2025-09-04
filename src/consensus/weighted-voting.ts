// Weighted Consensus Mechanism for DAO Voting
// Implements the algorithm specified in DAOCreation.md

import { DAOVote, WeatherOutcome, ConsensusResult, DAOConfig } from '../types/oracle-types';

export interface TieBreakerData {
  blockEntropy: string;
  cycleId: number;
}

export class WeightedVotingSystem {
  
  /**
   * Calculate weighted consensus from DAO votes
   * Based on the algorithm from DAOCreation.md:
   * weighted_sum / total_weight where each vote contributes (prediction * confidence * weight)
   */
  calculateConsensus(
    votes: DAOVote[], 
    daoConfigs: Map<string, DAOConfig>, 
    cycleId: number,
    tieBreakerData?: TieBreakerData
  ): ConsensusResult {
    
    if (votes.length === 0) {
      throw new Error('No votes provided for consensus calculation');
    }

    // Calculate weighted sum and total weight
    let weightedSum = 0;
    let totalWeight = 0;
    const validVotes: DAOVote[] = [];

    for (const vote of votes) {
      const daoConfig = daoConfigs.get(vote.daoId);
      if (!daoConfig || !daoConfig.isActive) {
        console.warn(`Skipping vote from inactive DAO: ${vote.daoId}`);
        continue;
      }

      // Get DAO weight (default to 0.5 if not found)
      const weight = daoConfig.weight || 0.5;
      
      // Ensure confidence is within valid range
      const confidence = Math.min(1.0, Math.max(0.1, vote.confidence));
      
      // Convert prediction enum to numeric value
      const predictionValue = vote.prediction === WeatherOutcome.GOOD ? 1 : -1;
      
      // Calculate contribution to weighted sum
      const contribution = predictionValue * confidence * weight;
      weightedSum += contribution;
      totalWeight += confidence * weight;
      
      validVotes.push(vote);
    }

    if (totalWeight === 0) {
      throw new Error('Total weight is zero - no valid votes');
    }

    // Calculate consensus score (-1 to +1)
    const consensusScore = weightedSum / totalWeight;
    
    // Determine final weather outcome with tie-breaking
    let finalWeather: WeatherOutcome;
    let tieBreaker = false;
    
    if (consensusScore > 0.05) {
      finalWeather = WeatherOutcome.GOOD;
    } else if (consensusScore < -0.05) {
      finalWeather = WeatherOutcome.BAD;
    } else {
      // Tie breaking scenario (consensus between -0.05 and +0.05)
      tieBreaker = true;
      finalWeather = this.resolveTie(consensusScore, cycleId, tieBreakerData);
    }

    console.log(`Consensus calculated: score=${consensusScore.toFixed(4)}, outcome=${finalWeather === WeatherOutcome.GOOD ? 'GOOD' : 'BAD'}${tieBreaker ? ' (tie-breaker)' : ''}`);

    return {
      cycleId,
      consensusScore,
      finalWeather,
      votes: validVotes,
      timestamp: Date.now(),
      tieBreaker
    };
  }

  /**
   * Resolve tie using block entropy hash
   * As specified: hash(block_entropy + cycle_id) % 2
   */
  private resolveTie(consensusScore: number, cycleId: number, tieBreakerData?: TieBreakerData): WeatherOutcome {
    if (!tieBreakerData) {
      // Fallback: use consensus score sign if no tie breaker data
      console.warn('No tie breaker data provided, using consensus score sign');
      return consensusScore >= 0 ? WeatherOutcome.GOOD : WeatherOutcome.BAD;
    }

    try {
      // Create hash input from block entropy and cycle ID
      const hashInput = tieBreakerData.blockEntropy + cycleId.toString();
      
      // Simple hash function (in production, use crypto.createHash)
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      // Use modulo 2 to get 0 or 1
      const tieResult = Math.abs(hash) % 2;
      
      const result = tieResult === 0 ? WeatherOutcome.BAD : WeatherOutcome.GOOD;
      console.log(`Tie resolved using entropy: hash=${hash}, result=${result === WeatherOutcome.GOOD ? 'GOOD' : 'BAD'}`);
      
      return result;
    } catch (error) {
      console.error('Error in tie resolution, defaulting to BAD:', error);
      return WeatherOutcome.BAD;
    }
  }

  /**
   * Analyze consensus results and provide insights
   */
  analyzeConsensus(result: ConsensusResult): {
    strength: 'strong' | 'moderate' | 'weak' | 'tie';
    agreement: number; // 0-1 scale
    topDAOs: Array<{daoId: string, contribution: number}>;
    summary: string;
  } {
    const absScore = Math.abs(result.consensusScore);
    
    // Determine consensus strength
    let strength: 'strong' | 'moderate' | 'weak' | 'tie';
    if (result.tieBreaker) {
      strength = 'tie';
    } else if (absScore > 0.5) {
      strength = 'strong';
    } else if (absScore > 0.2) {
      strength = 'moderate';
    } else {
      strength = 'weak';
    }

    // Calculate agreement (how unified the votes are)
    const goodVotes = result.votes.filter(v => v.prediction === WeatherOutcome.GOOD).length;
    const totalVotes = result.votes.length;
    const majoritySize = Math.max(goodVotes, totalVotes - goodVotes);
    const agreement = majoritySize / totalVotes;

    // Find top contributing DAOs (by absolute contribution)
    const contributions = result.votes.map(vote => {
      const predictionValue = vote.prediction === WeatherOutcome.GOOD ? 1 : -1;
      return {
        daoId: vote.daoId,
        contribution: Math.abs(predictionValue * vote.confidence)
      };
    });
    
    const topDAOs = contributions
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3);

    // Generate summary
    const outcomeText = result.finalWeather === WeatherOutcome.GOOD ? 'GOOD' : 'BAD';
    const scoreText = result.consensusScore.toFixed(3);
    const agreementText = (agreement * 100).toFixed(1);
    
    let summary = `${strength.toUpperCase()} consensus for ${outcomeText} weather (score: ${scoreText}, agreement: ${agreementText}%)`;
    if (result.tieBreaker) {
      summary += ' - resolved via tie-breaker';
    }

    return {
      strength,
      agreement,
      topDAOs,
      summary
    };
  }

  /**
   * Validate consensus parameters before calculation
   */
  validateConsensusInputs(votes: DAOVote[], daoConfigs: Map<string, DAOConfig>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if we have any votes
    if (votes.length === 0) {
      errors.push('No votes provided');
      return { isValid: false, errors, warnings };
    }

    // Check vote validity
    let validVoteCount = 0;
    for (const vote of votes) {
      // Check if DAO exists and is active
      const dao = daoConfigs.get(vote.daoId);
      if (!dao) {
        warnings.push(`Vote from unknown DAO: ${vote.daoId}`);
        continue;
      }
      if (!dao.isActive) {
        warnings.push(`Vote from inactive DAO: ${vote.daoId}`);
        continue;
      }

      // Check confidence range
      if (vote.confidence < 0.1 || vote.confidence > 1.0) {
        warnings.push(`Invalid confidence for ${vote.daoId}: ${vote.confidence}`);
      }

      // Check prediction validity
      if (vote.prediction !== WeatherOutcome.GOOD && vote.prediction !== WeatherOutcome.BAD) {
        errors.push(`Invalid prediction from ${vote.daoId}: ${vote.prediction}`);
        continue;
      }

      validVoteCount++;
    }

    if (validVoteCount === 0) {
      errors.push('No valid votes after filtering');
    } else if (validVoteCount < 3) {
      warnings.push(`Low vote count: only ${validVoteCount} valid votes`);
    }

    const isValid = errors.length === 0;
    return { isValid, errors, warnings };
  }
}