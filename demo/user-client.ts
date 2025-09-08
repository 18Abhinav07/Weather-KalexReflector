#!/usr/bin/env bun
import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';

interface UserStrategy {
  name: string;
  userId: string;
  strategy: 'aggressive' | 'conservative' | 'mixed';
  color: string;
}

interface CycleStatus {
  cycleId: string;
  currentBlock: number;
  cycleState: string;
  selectedLocation?: any;
  phase: string;
}

class UserClient {
  private user: UserStrategy;
  private currentBlock = 0;
  private actions: any[] = [];
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(user: UserStrategy) {
    this.user = user;
    console.log(`${this.user.color}🚀 ${this.user.name} (${this.user.strategy.toUpperCase()}) client starting...${'\x1b[0m'}`);
  }

  async start() {
    console.log(`${this.user.color}📡 ${this.user.name}: Connecting to backend server...${'\x1b[0m'}`);
    
    try {
      // Check server health
      await this.checkHealth();
      
      // Start polling for updates
      this.startPolling();
      
    } catch (error) {
      console.error(`${this.user.color}❌ ${this.user.name}: Failed to connect to server:${'\x1b[0m'}`, error);
      process.exit(1);
    }
  }

  async checkHealth() {
    const response = await axios.get(`${API_BASE}/health`);
    console.log(`${this.user.color}✅ ${this.user.name}: Connected to server (Block ${response.data.block})${'\x1b[0m'}`);
  }

  startPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollServerUpdate();
      } catch (error) {
        console.error(`${this.user.color}⚠️  ${this.user.name}: Polling error:${'\x1b[0m'}`, error.message);
      }
    }, 1000); // Poll every second
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
    const response = await axios.get(`${API_BASE}/users/${this.user.userId}/balance`);
    return response.data.balance;
  }

  async handleNewBlock(status: CycleStatus) {
    console.log(`${this.user.color}📍 ${this.user.name}: Block ${this.currentBlock} - Phase: ${status.phase}${'\x1b[0m'}`);
    
    // Special notifications
    if (this.currentBlock === 6 && status.selectedLocation) {
      console.log(`${this.user.color}🌍 ${this.user.name}: Location revealed - ${status.selectedLocation.name}!${'\x1b[0m'}`);
      console.log(`${this.user.color}📢 ${this.user.name}: Agriculture phase started!${'\x1b[0m'}`);
    }
    
    if (this.currentBlock === 10) {
      await this.handleCycleCompletion();
      return;
    }
    
    // Decide action based on strategy
    const action = this.decideAction(status);
    
    if (action && action.actionType !== 'stay') {
      await this.submitAction(action);
    } else {
      console.log(`${this.user.color}⏸️  ${this.user.name}: Staying put this block${'\x1b[0m'}`);
    }
  }

  decideAction(status: CycleStatus) {
    const block = this.currentBlock;
    
    // Block 1-5: Wager phase
    if (block <= 5) {
      switch (this.user.strategy) {
        case 'aggressive':
          if (block === 1) {
            return {
              actionType: 'wager',
              actionData: { direction: 'good', amount: 2000 }
            };
          }
          break;
          
        case 'conservative':
          if (block === 3) {
            return {
              actionType: 'wager', 
              actionData: { direction: 'bad', amount: 500 }
            };
          }
          break;
          
        case 'mixed':
          if (block === 2) {
            return {
              actionType: 'wager',
              actionData: { direction: 'good', amount: 1000 }
            };
          } else if (block === 4) {
            return {
              actionType: 'agriculture',
              actionData: { amount: 800 }
            };
          }
          break;
      }
    }
    // Block 6-10: Agriculture phase  
    else {
      switch (this.user.strategy) {
        case 'aggressive':
          if (block === 7) {
            return {
              actionType: 'agriculture',
              actionData: { amount: 3000 }
            };
          } else if (block === 8) {
            return {
              actionType: 'agriculture', 
              actionData: { work: true }
            };
          }
          break;
          
        case 'conservative':
          if (block === 8) {
            return {
              actionType: 'agriculture',
              actionData: { amount: 1000 }
            };
          }
          break;
          
        case 'mixed':
          if (block === 7) {
            return {
              actionType: 'agriculture',
              actionData: { amount: 1500 }
            };
          }
          break;
      }
    }
    
    return { actionType: 'stay', actionData: {} };
  }

  async submitAction(action: any) {
    try {
      const response = await axios.post(`${API_BASE}/users/${this.user.userId}/actions`, action);
      
      this.actions.push({ block: this.currentBlock, ...action });
      
      if (action.actionType === 'wager') {
        console.log(`${this.user.color}💰 ${this.user.name}: Placed ${action.actionData.amount} KALE wager on ${action.actionData.direction.toUpperCase()} weather${'\x1b[0m'}`);
      } else if (action.actionType === 'agriculture') {
        if (action.actionData.amount) {
          console.log(`${this.user.color}🌱 ${this.user.name}: Planted ${action.actionData.amount} KALE${'\x1b[0m'}`);
        } else if (action.actionData.work) {
          console.log(`${this.user.color}💪 ${this.user.name}: Completed farm work${'\x1b[0m'}`);
        }
      }
      
    } catch (error) {
      console.error(`${this.user.color}❌ ${this.user.name}: Action failed:${'\x1b[0m'}`, error.response?.data?.error || error.message);
    }
  }

  async handleCycleCompletion() {
    console.log(`${this.user.color}🏁 ${this.user.name}: Cycle completed! Getting results...${'\x1b[0m'}`);
    
    try {
      // Wait a moment for server to calculate results
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await axios.get(`${API_BASE}/cycle/results`);
      const results = response.data;
      
      // Find my results
      const myResults = results.finalResults?.filter((r: any) => r.userId === this.user.userId) || [];
      
      console.log(`${this.user.color}═══════════════════════════════${'\x1b[0m'}`);
      console.log(`${this.user.color}🏆 ${this.user.name.toUpperCase()} FINAL RESULTS:${'\x1b[0m'}`);
      console.log(`${this.user.color}═══════════════════════════════${'\x1b[0m'}`);
      
      let totalReward = 0;
      
      for (const result of myResults) {
        if (result.type === 'wager') {
          console.log(`${this.user.color}💰 Wager: ${result.amount} KALE on ${result.direction.toUpperCase()}${'\x1b[0m'}`);
          console.log(`${this.user.color}   ${result.won ? '✅ WON' : '❌ LOST'}: ${result.payout} KALE${'\x1b[0m'}`);
          totalReward += result.payout;
        } else if (result.type === 'agriculture') {
          console.log(`${this.user.color}🌱 Planted: ${result.planted} KALE${'\x1b[0m'}`);
          console.log(`${this.user.color}   📈 Reward: ${result.finalReward.toFixed(2)} KALE (${result.weatherMultiplier}x weather)${'\x1b[0m'}`);
          totalReward += result.finalReward;
        }
      }
      
      console.log(`${this.user.color}${'-'.repeat(31)}${'\x1b[0m'}`);
      console.log(`${this.user.color}🏆 TOTAL REWARD: ${totalReward.toFixed(2)} KALE${'\x1b[0m'}`);
      console.log(`${this.user.color}📊 Total Actions: ${this.actions.length}${'\x1b[0m'}`);
      console.log(`${this.user.color}═══════════════════════════════${'\x1b[0m'}`);
      
    } catch (error) {
      console.error(`${this.user.color}❌ ${this.user.name}: Failed to get results:${'\x1b[0m'}`, error.message);
    }
    
    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    
    // Exit after showing results
    setTimeout(() => process.exit(0), 2000);
  }
}

// Get user strategy from command line argument
const strategy = process.argv[2] as 'aggressive' | 'conservative' | 'mixed';

if (!strategy || !['aggressive', 'conservative', 'mixed'].includes(strategy)) {
  console.error('Usage: bun user-client.ts <aggressive|conservative|mixed>');
  process.exit(1);
}

// User configurations
const users = {
  aggressive: {
    name: 'Alice',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    strategy: 'aggressive' as const,
    color: '\x1b[31m' // Red
  },
  conservative: {
    name: 'Bob', 
    userId: '550e8400-e29b-41d4-a716-446655440002',
    strategy: 'conservative' as const,
    color: '\x1b[34m' // Blue
  },
  mixed: {
    name: 'Charlie',
    userId: '550e8400-e29b-41d4-a716-446655440003', 
    strategy: 'mixed' as const,
    color: '\x1b[33m' // Yellow
  }
};

// Create and start user client
const client = new UserClient(users[strategy]);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`${users[strategy].color}🛑 ${users[strategy].name}: Shutting down client...${'\x1b[0m'}`);
  process.exit(0);
});

// Start the client
client.start().catch((error) => {
  console.error(`${users[strategy].color}💥 ${users[strategy].name}: Client crashed:${'\x1b[0m'}`, error);
  process.exit(1);
});