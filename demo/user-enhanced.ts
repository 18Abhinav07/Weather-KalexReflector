#!/usr/bin/env bun
import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:4000/api';

interface UserProfile {
  id: string;
  name: string;
  strategy: 'alice' | 'bob' | 'charlie';
  color: string;
  balance: number;
  trustWeights: {
    bull: number;
    bear: number;
    technical: number;
    sentiment: number;
  };
}

interface DAOVote {
  prediction: 'GOOD' | 'BAD';
  confidence: number;
  revealed: boolean;
}

interface CycleStatus {
  cycleId: string;
  currentBlock: number;
  totalBlocks: number;
  cycleState: string;
  selectedLocation?: any;
  weatherOutcome?: 'GOOD' | 'BAD';
  phase: string;
  daoVotes: { [key: string]: DAOVote };
}

class EnhancedUserClient {
  private user: UserProfile;
  private currentBlock = 0;
  private actions: any[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private weatherPrediction: 'GOOD' | 'BAD' | 'UNCERTAIN' = 'UNCERTAIN';
  private confidence = 0.5;

  constructor(profile: UserProfile) {
    this.user = profile;
    console.log(`${this.user.color}🚀 ${this.user.name} connecting to KALE Weather Farming System...${'\x1b[0m'}`);
  }

  async start() {
    try {
      // Connect to server
      await axios.post(`${API_BASE}/users/${this.user.id}/connect`);
      console.log(`${this.user.color}✅ ${this.user.name} successfully connected!${'\x1b[0m'}`);
      
      // Show initial balance
      const balance = await this.getBalance();
      console.log(`${this.user.color}💰 Starting balance: ${balance.toLocaleString()} KALE${'\x1b[0m'}`);
      
      this.startPolling();
      
    } catch (error) {
      console.error(`${this.user.color}❌ Connection failed:${'\x1b[0m'}`, error.message);
      process.exit(1);
    }
  }

  startPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollServerUpdate();
      } catch (error) {
        console.error(`${this.user.color}⚠️  Polling error:${'\x1b[0m'}`, error.message);
      }
    }, 2000); // Poll every 2 seconds
  }

  async pollServerUpdate() {
    const status = await this.getCycleStatus();
    
    if (status.currentBlock !== this.currentBlock) {
      this.currentBlock = status.currentBlock;
      await this.handleNewBlock(status);
    }
  }

  async getCycleStatus(): Promise<CycleStatus> {
    const response = await axios.get(`${API_BASE}/cycle/status`);
    return response.data;
  }

  async getBalance() {
    const response = await axios.get(`${API_BASE}/users/${this.user.id}/balance`);
    return response.data.balance;
  }

  async handleNewBlock(status: CycleStatus) {
    console.log(`\n${this.user.color}📍 ${this.user.name} - BLOCK ${this.currentBlock}${'\x1b[0m'}`);
    console.log(`${this.user.color}${'─'.repeat(50)}${'\x1b[0m'}`);
    
    // Analyze DAO votes when revealed
    if (this.hasNewDAOVotes(status.daoVotes)) {
      this.analyzeDAOVotes(status.daoVotes);
    }
    
    // Handle location reveal
    if (this.currentBlock === 6 && status.selectedLocation) {
      this.handleLocationReveal(status.selectedLocation);
    }
    
    // Handle weather reveal
    if (this.currentBlock === 10 && status.weatherOutcome) {
      await this.handleWeatherReveal(status.weatherOutcome);
      return;
    }
    
    // Make decision and take action
    if (this.currentBlock <= 9) {
      const action = this.makeDecision(status);
      if (action && action.actionType !== 'stay') {
        await this.submitAction(action);
      } else {
        console.log(`${this.user.color}⏸️  ${this.user.name}: Staying put this block${'\x1b[0m'}`);
      }
    }
  }

  hasNewDAOVotes(currentVotes: { [key: string]: DAOVote }): boolean {
    return Object.values(currentVotes).some(vote => vote.revealed);
  }

  analyzeDAOVotes(daoVotes: { [key: string]: DAOVote }) {
    console.log(`\n${this.user.color}🧠 ${this.user.name} analyzing DAO votes:${'\x1b[0m'}`);
    
    let weightedScore = 0;
    let totalWeight = 0;
    let revealedVotes = 0;
    
    Object.entries(daoVotes).forEach(([dao, vote]) => {
      if (vote.revealed) {
        const trust = this.user.trustWeights[dao as keyof typeof this.user.trustWeights];
        const score = vote.prediction === 'GOOD' ? 1 : -1;
        const weightedContribution = score * vote.confidence * trust;
        
        weightedScore += weightedContribution;
        totalWeight += trust;
        revealedVotes++;
        
        console.log(`${this.user.color}   ${dao.toUpperCase()}: ${vote.prediction} (${(vote.confidence * 100).toFixed(1)}% confident) - Trust: ${(trust * 100).toFixed(0)}%${'\x1b[0m'}`);
      }
    });
    
    if (totalWeight > 0) {
      const normalizedScore = weightedScore / totalWeight;
      this.confidence = Math.abs(normalizedScore);
      this.weatherPrediction = normalizedScore > 0.1 ? 'GOOD' : normalizedScore < -0.1 ? 'BAD' : 'UNCERTAIN';
      
      console.log(`\n${this.user.color}📊 ${this.user.name}'s Analysis:${'\x1b[0m'}`);
      console.log(`${this.user.color}   Weather Prediction: ${this.weatherPrediction}${'\x1b[0m'}`);
      console.log(`${this.user.color}   Confidence Level: ${(this.confidence * 100).toFixed(1)}%${'\x1b[0m'}`);
      
      // Strategic thinking based on prediction
      this.explainStrategy();
    }
  }

  explainStrategy() {
    console.log(`\n${this.user.color}💭 ${this.user.name}'s Strategic Thinking:${'\x1b[0m'}`);
    
    if (this.weatherPrediction === 'GOOD' && this.confidence > 0.6) {
      console.log(`${this.user.color}   "DAO signals look positive! Time to be aggressive with plants and good weather wagers."${'\x1b[0m'}`);
    } else if (this.weatherPrediction === 'BAD' && this.confidence > 0.6) {
      console.log(`${this.user.color}   "Multiple DAOs predict bad weather. I should store crops and bet on bad weather."${'\x1b[0m'}`);
    } else if (this.weatherPrediction === 'UNCERTAIN' || this.confidence < 0.5) {
      console.log(`${this.user.color}   "Mixed signals from DAOs. I need to be cautious and diversify my approach."${'\x1b[0m'}`);
    }
    
    // Strategy-specific thoughts
    if (this.user.strategy === 'alice') {
      console.log(`${this.user.color}   "High risk, high reward! I'll make big moves based on my analysis."${'\x1b[0m'}`);
    } else if (this.user.strategy === 'bob') {
      console.log(`${this.user.color}   "I prefer safety. I'll only act when I'm very confident."${'\x1b[0m'}`);
    } else if (this.user.strategy === 'charlie') {
      console.log(`${this.user.color}   "Balanced approach is key. I'll spread my risk across multiple strategies."${'\x1b[0m'}`);
    }
  }

  handleLocationReveal(location: any) {
    console.log(`\n${this.user.color}🌍 ${this.user.name} - LOCATION REVEALED!${'\x1b[0m'}`);
    console.log(`${this.user.color}📍 Selected Location: ${location.name}, ${location.country}${'\x1b[0m'}`);
    console.log(`${this.user.color}⚠️  WAGER PHASE ENDED - Only agriculture decisions from now on!${'\x1b[0m'}`);
    
    // Update strategy based on location
    console.log(`\n${this.user.color}🧠 ${this.user.name}'s Location Analysis:${'\x1b[0m'}`);
    console.log(`${this.user.color}   "Now I know the exact location, I can refine my agriculture strategy."${'\x1b[0m'}`);
    console.log(`${this.user.color}   "Coordinates: ${location.coordinates.lat}, ${location.coordinates.lon}"${'\x1b[0m'}`);
    
    if (this.weatherPrediction === 'GOOD') {
      console.log(`${this.user.color}   "Still confident in good weather - will focus on planting."${'\x1b[0m'}`);
    } else if (this.weatherPrediction === 'BAD') {
      console.log(`${this.user.color}   "Still expecting bad weather - will store crops for protection."${'\x1b[0m'}`);
    }
  }

  makeDecision(status: CycleStatus) {
    const block = this.currentBlock;
    
    // Blocks 1-5: Wager AND Agriculture allowed
    if (block <= 5) {
      return this.makeEarlyPhaseDecision(block, status);
    }
    // Blocks 6-9: Agriculture only
    else if (block <= 9) {
      return this.makeAgricultureDecision(block, status);
    }
    
    return { actionType: 'stay', actionData: {} };
  }

  makeEarlyPhaseDecision(block: number, status: CycleStatus) {
    switch (this.user.strategy) {
      case 'alice': // Aggressive
        if (block === 1) {
          const direction = Math.random() > 0.4 ? 'good' : 'bad'; // More aggressive bias
          return { actionType: 'wager', actionData: { direction, amount: 3000 } };
        }
        if (block === 3) {
          if (this.weatherPrediction === 'GOOD' && this.confidence > 0.5) {
            return { actionType: 'plant', actionData: { amount: 2500 } };
          } else {
            return { actionType: 'wager', actionData: { direction: 'bad', amount: 1000 } };
          }
        }
        if (block === 5 && this.weatherPrediction !== 'UNCERTAIN') {
          const actionType = this.weatherPrediction === 'GOOD' ? 'plant' : 'store';
          return { actionType, actionData: { amount: 2000 } };
        }
        break;
        
      case 'bob': // Conservative
        if (block === 2) {
          if (this.weatherPrediction !== 'UNCERTAIN') {
            const direction = this.weatherPrediction === 'GOOD' ? 'good' : 'bad';
            return { actionType: 'wager', actionData: { direction, amount: 800 } };
          } else {
            // Small wager even if uncertain
            return { actionType: 'wager', actionData: { direction: 'bad', amount: 400 } };
          }
        }
        if (block === 4 && this.weatherPrediction !== 'GOOD') {
          return { actionType: 'store', actionData: { amount: 1200 } };
        }
        break;
        
      case 'charlie': // Balanced
        if (block === 2 && this.weatherPrediction !== 'UNCERTAIN') {
          const direction = this.weatherPrediction === 'GOOD' ? 'good' : 'bad';
          return { actionType: 'wager', actionData: { direction, amount: 1500 } };
        }
        if (block === 4) {
          if (this.weatherPrediction === 'GOOD') {
            return { actionType: 'plant', actionData: { amount: 1800 } };
          } else {
            return { actionType: 'store', actionData: { amount: 1000 } };
          }
        }
        break;
    }
    
    return { actionType: 'stay', actionData: {} };
  }

  makeAgricultureDecision(block: number, status: CycleStatus) {
    switch (this.user.strategy) {
      case 'alice': // Aggressive agriculture
        if (block === 7 && this.weatherPrediction === 'GOOD') {
          return { actionType: 'plant', actionData: { amount: 3500 } };
        }
        if (block === 8 && this.weatherPrediction === 'BAD') {
          return { actionType: 'store', actionData: { amount: 2000 } };
        }
        if (block === 9) {
            // Final aggressive move
            const actionType = this.weatherPrediction === 'GOOD' ? 'plant' : 'store';
            return { actionType, actionData: { amount: 1500 } };
        }
        break;
        
      case 'bob': // Conservative agriculture
        if (block === 8) {
          if (this.weatherPrediction === 'GOOD' && this.confidence > 0.6) { // Lowered confidence threshold
            return { actionType: 'plant', actionData: { amount: 1500 } };
          } else {
            return { actionType: 'store', actionData: { amount: 1000 } };
          }
        }
        break;
        
      case 'charlie': // Balanced agriculture
        if (block === 7) {
          const amount = this.weatherPrediction === 'GOOD' ? 2000 : 800;
          const actionType = this.weatherPrediction === 'GOOD' ? 'plant' : 'store';
          return { actionType, actionData: { amount } };
        }
        if (block === 9) {
          // Final hedge
          const actionType = this.weatherPrediction !== 'GOOD' ? 'store' : 'plant';
          return { actionType, actionData: { amount: 500 } };
        }
        break;
    }
    
    return { actionType: 'stay', actionData: {} };
  }

  async submitAction(action: any) {
    try {
      const response = await axios.post(`${API_BASE}/users/${this.user.id}/actions`, action);
      
      this.actions.push({ block: this.currentBlock, ...action });
      
      console.log(`\n${this.user.color}✅ ${this.user.name} - ACTION TAKEN:${'\x1b[0m'}`);
      
      if (action.actionType === 'wager') {
        console.log(`${this.user.color}💰 Placed ${action.actionData.amount.toLocaleString()} KALE wager on ${action.actionData.direction.toUpperCase()} weather${'\x1b[0m'}`);
      } else if (action.actionType === 'plant') {
        console.log(`${this.user.color}🌱 Planted ${action.actionData.amount.toLocaleString()} KALE (expecting good weather rewards)${'\x1b[0m'}`);
      } else if (action.actionType === 'store') {
        console.log(`${this.user.color}🏪 Stored ${action.actionData.amount.toLocaleString()} KALE (seeking protection from bad weather)${'\x1b[0m'}`);
      }
      
    } catch (error) {
      console.error(`${this.user.color}❌ ${this.user.name} - Action failed:${'\x1b[0m'}`, error.response?.data?.error || error.message);
    }
  }

  async handleWeatherReveal(weatherOutcome: 'GOOD' | 'BAD') {
    console.log(`\n${this.user.color}🌤️  ${this.user.name} - WEATHER REVEALED: ${weatherOutcome} WEATHER!${'\x1b[0m'}`);
    
    const wasCorrect = this.weatherPrediction === weatherOutcome || 
                      (this.weatherPrediction === 'UNCERTAIN' && Math.random() > 0.5);
    
    if (wasCorrect) {
      console.log(`${this.user.color}🎯 ${this.user.name}: "My analysis was correct! Good strategic decisions."${'\x1b[0m'}`);
    } else {
      console.log(`${this.user.color}😅 ${this.user.name}: "The DAOs fooled me this time! I'll adjust my trust weights."${'\x1b[0m'}`);
    }
    
    // Wait for final results
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.showFinalResults();
  }

  async showFinalResults() {
    try {
      const response = await axios.get(`${API_BASE}/cycle/results`);
      const results = response.data.finalResults.find((r: any) => r.userId === this.user.id);
      
      if (!results) {
        console.log(`${this.user.color}❌ ${this.user.name}: No results found${'\x1b[0m'}`);
        return;
      }
      
      console.log(`\n${this.user.color}${'═'.repeat(60)}${'\x1b[0m'}`);
      console.log(`${this.user.color}🏆 ${this.user.name.toUpperCase()} - FINAL RESULTS${'\x1b[0m'}`);
      console.log(`${this.user.color}${'═'.repeat(60)}${'\x1b[0m'}`);
      
      let totalWagered = 0;
      let totalPlanted = 0;
      let totalStored = 0;
      
      console.log(`\n${this.user.color}📊 DETAILED BREAKDOWN:${'\x1b[0m'}`);
      
      for (const item of results.breakdown) {
        const emoji = item.amount >= 0 ? '✅' : '❌';
        const sign = item.amount >= 0 ? '+' : '';
        
        console.log(`${this.user.color}${emoji} ${item.action}${'\x1b[0m'}`);
        console.log(`${this.user.color}   Result: ${item.result}${'\x1b[0m'}`);
        console.log(`${this.user.color}   Amount: ${sign}${item.amount.toFixed(1)} KALE${'\x1b[0m'}`);
        console.log(`${this.user.color}   Details: ${item.details}${'\x1b[0m'}`);
        console.log('');
        
        // Track totals for summary
        if (item.type === 'wager' && item.amount < 0) {
          totalWagered += Math.abs(item.amount);
        } else if (item.type === 'plant') {
          totalPlanted += Math.abs(item.amount);
        } else if (item.type === 'store') {
          totalStored += Math.abs(item.amount);
        }
      }
      
      console.log(`${this.user.color}${'─'.repeat(60)}${'\x1b[0m'}`);
      console.log(`${this.user.color}📈 SUMMARY:${'\x1b[0m'}`);
      console.log(`${this.user.color}   💰 Total Wagered: ${totalWagered.toLocaleString()} KALE${'\x1b[0m'}`);
      console.log(`${this.user.color}   🌱 Total Planted: ${totalPlanted.toLocaleString()} KALE${'\x1b[0m'}`);
      console.log(`${this.user.color}   🏪 Total Stored: ${totalStored.toLocaleString()} KALE${'\x1b[0m'}`);
      console.log(`${this.user.color}   📊 Total Actions: ${this.actions.length}${'\x1b[0m'}`);
      
      console.log(`\n${this.user.color}🏆 NET RESULT: ${results.netResult >= 0 ? '+' : ''}${results.netResult.toFixed(2)} KALE${'\x1b[0m'}`);
      
      const performance = results.netResult > 0 ? 'PROFITABLE' : results.netResult < 0 ? 'LOSS' : 'BREAK-EVEN';
      console.log(`${this.user.color}📊 Performance: ${performance}${'\x1b[0m'}`);
      
      console.log(`\n${this.user.color}${'═'.repeat(60)}${'\x1b[0m'}`);
      
    } catch (error) {
      console.error(`${this.user.color}❌ Failed to get results:${'\x1b[0m'}`, error.message);
    }
    
    if (this.pollInterval) clearInterval(this.pollInterval);
    setTimeout(() => process.exit(0), 3000);
  }
}

// User profiles with different trust weights and strategies
const userProfiles = {
  alice: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Alice Thompson',
    strategy: 'alice' as const,
    color: '\x1b[31m', // Red
    balance: 10000,
    trustWeights: { bull: 0.4, bear: 0.1, technical: 0.4, sentiment: 0.1 } // Trusts Bull & Technical
  },
  bob: {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Bob Chen',
    strategy: 'bob' as const,
    color: '\x1b[34m', // Blue
    balance: 4000,
    trustWeights: { bull: 0.1, bear: 0.4, technical: 0.1, sentiment: 0.4 } // Trusts Bear & Sentiment
  },
  charlie: {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Charlie Rodriguez',
    strategy: 'charlie' as const,
    color: '\x1b[33m', // Yellow
    balance: 7500,
    trustWeights: { bull: 0.25, bear: 0.25, technical: 0.25, sentiment: 0.25 } // Trusts all equally
  }
};

const strategy = process.argv[2] as keyof typeof userProfiles;

if (!strategy || !userProfiles[strategy]) {
  console.error('Usage: bun user-enhanced.ts <alice|bob|charlie>');
  process.exit(1);
}

const client = new EnhancedUserClient(userProfiles[strategy]);

process.on('SIGINT', () => {
  console.log(`${userProfiles[strategy].color}🛑 ${userProfiles[strategy].name}: Shutting down...${'\x1b[0m'}`);
  process.exit(0);
});

client.start().catch((error) => {
  console.error(`${userProfiles[strategy].color}💥 ${userProfiles[strategy].name}: Client error:${'\x1b[0m'}`, error);
  process.exit(1);
});