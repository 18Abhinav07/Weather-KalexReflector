#!/usr/bin/env bun

import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';

const API_BASE = 'http://localhost:3000/api';
const FRONTEND_URL = 'http://localhost:3000';

interface User {
  userId: string;
  username: string;
  email: string;
  role: string;
  custodialWallet?: {
    publicKey: string;
    privateKey: string;
  };
}

interface Cycle {
  cycleId: string;
  phase: 'planting' | 'working' | 'revealing' | 'settling';
  currentBlock: string;
  blocksRemaining: number;
  startBlock: string;
}

interface ActionData {
  agricultureType?: 'plant' | 'store';
  stakeAmount?: number;
  wagerType?: 'good' | 'bad';
  wagerAmount?: number;
}

class WeatherFarmingDemo {
  private users: User[] = [];
  private currentCycle: Cycle | null = null;
  private servers: ChildProcess[] = [];

  async start(): Promise<void> {
    console.log(chalk.cyan.bold(`
    ╔═══════════════════════════════════════╗
    ║        KALE WEATHER FARMING           ║
    ║         COMPLETE DEMO FLOW            ║
    ╚═══════════════════════════════════════╝
    `));

    try {
      await this.startServers();
      await this.setupDemoUsers();
      await this.demonstrateCycleFlow();
    } catch (error: any) {
      console.error(chalk.red('Demo failed:'), error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  private async startServers(): Promise<void> {
    console.log(chalk.yellow('🚀 Starting backend server...'));
    
    const backend = spawn('bun', ['src/index.ts'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    this.servers.push(backend);

    await this.waitForHealth();
    console.log(chalk.green('✅ Backend server running at localhost:3000'));
    console.log(chalk.blue('📱 Web interface: http://localhost:3000'));
  }

  private async waitForHealth(maxRetries: number = 20): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(`${FRONTEND_URL}/health`, { timeout: 2000 });
        if (response.data.success) return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Backend server failed to start');
  }

  private async setupDemoUsers(): Promise<void> {
    console.log(chalk.yellow('\n👥 Creating demo users...'));
    
    const userProfiles = [
      { username: 'alice_farmer', email: 'alice@weatherfarm.demo', role: 'Farmer' },
      { username: 'bob_wagerer', email: 'bob@weatherfarm.demo', role: 'Weather Bettor' },
      { username: 'charlie_mixed', email: 'charlie@weatherfarm.demo', role: 'Mixed Strategy' },
      { username: 'dao_voter_1', email: 'dao1@weatherfarm.demo', role: 'DAO Member' }
    ];

    for (const profile of userProfiles) {
      try {
        const response = await axios.post(`${API_BASE}/users/register`, {
          username: profile.username,
          email: profile.email
        });

        if (response.data.success) {
          const user: User = {
            ...response.data.data,
            role: profile.role
          };
          this.users.push(user);
          console.log(chalk.green(`✓ Created ${profile.role}: ${user.username} (${user.userId.substring(0, 8)}...)`));
        }
      } catch (error: any) {
        console.log(chalk.red(`Failed to create user ${profile.username}:`, error.message));
      }
    }

    console.log(chalk.green(`\n✅ Created ${this.users.length} demo users`));
  }

  private async demonstrateCycleFlow(): Promise<void> {
    console.log(chalk.cyan.bold('\n🌾 STARTING COMPLETE WEATHER FARMING CYCLE DEMO'));
    console.log(chalk.gray('Demonstrating all 4 phases:'));
    console.log(chalk.gray('1. PLANTING - Users stake and place wagers'));
    console.log(chalk.gray('2. WORKING - Agriculture-only actions'));
    console.log(chalk.gray('3. REVEALING - DAO weather consensus'));
    console.log(chalk.gray('4. SETTLING - Reward distribution'));

    await this.waitForCycleCompletion();
    await this.demonstratePlantingPhase();
    await this.demonstrateWorkingPhase();
    await this.demonstrateRevealingPhase();
    await this.demonstrateSettlingPhase();

    console.log(chalk.green.bold('\n🎉 DEMO COMPLETED!'));
    console.log(chalk.blue(`📱 Web interface: ${FRONTEND_URL}`));
    console.log(chalk.blue(`🔧 CLI: cd cli && bun start`));
  }

  private async waitForCycleCompletion(): Promise<void> {
    console.log(chalk.yellow('⏳ Waiting for cycle availability...'));
    
    while (true) {
      try {
        const response = await axios.get(`${API_BASE}/cycles/current`);
        if (!response.data.success || !response.data.data.cycle) break;
        
        const cycle = response.data.data.cycle;
        console.log(chalk.gray(`Waiting... Cycle ${cycle.cycleId} in ${cycle.phase}`));
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        break;
      }
    }
  }

  private async demonstratePlantingPhase(): Promise<void> {
    console.log(chalk.green.bold('\n🌱 PHASE 1: PLANTING'));
    await this.waitForPhase('planting');

    const [alice, bob, charlie] = this.users;

    console.log(chalk.yellow(`👨‍🌾 ${alice.username} planting crops...`));
    await this.submitUserAction(alice.userId, 'agriculture', {
      agricultureType: 'plant',
      stakeAmount: 100
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(chalk.yellow(`🎰 ${bob.username} betting on GOOD weather...`));
    await this.submitUserAction(bob.userId, 'wager', {
      wagerType: 'good',
      wagerAmount: 50
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(chalk.yellow(`🎰 ${charlie.username} betting on BAD weather...`));
    await this.submitUserAction(charlie.userId, 'wager', {
      wagerType: 'bad',
      wagerAmount: 30
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show wager pool status
    try {
      const poolResponse = await axios.get(`${API_BASE}/wagers/current-pool`);
      if (poolResponse.data.success) {
        const pool = poolResponse.data.data.pool;
        console.log(chalk.cyan('\n📊 WAGER POOL STATUS:'));
        console.log(chalk.white(`   Good Weather Bets: ${pool.totalGoodStakes} KALE`));
        console.log(chalk.white(`   Bad Weather Bets: ${pool.totalBadStakes} KALE`));
        console.log(chalk.white(`   Total Pool: ${pool.totalStakes} KALE`));
        console.log(chalk.white(`   Bet Influence: ${pool.betInfluence > 0 ? '+' : ''}${pool.betInfluence.toFixed(2)}`));
        console.log(chalk.white(`   Dominant Side: ${pool.dominantSide || 'Balanced'}`));
      }
    } catch (error) {
      console.log(chalk.gray('Wager pool data not available yet'));
    }

    console.log(chalk.green('✅ Planting phase completed'));
    await this.displayCycleStatus();
  }

  private async demonstrateWorkingPhase(): Promise<void> {
    console.log(chalk.green.bold('\n🔨 PHASE 2: WORKING (Location Reveal at Block 6)'));
    await this.waitForPhase('working');

    console.log(chalk.blue('📍 REAL-WORLD LOCATION REVEALED!'));
    
    // Try to get the revealed location and weather data
    try {
      const response = await axios.get(`${API_BASE}/cycles/current`);
      if (response.data.success && response.data.data.cycle.revealedLocation) {
        const location = response.data.data.cycle.revealedLocation;
        console.log(chalk.cyan(`🌍 Selected Location: ${location.name}`));
        console.log(chalk.white(`   Coordinates: ${location.coordinates.lat}, ${location.coordinates.lon}`));
        console.log(chalk.white(`   Climate Zone: ${location.climateZone || 'temperate'}`));
        console.log(chalk.yellow('   Weather wagers are now closed - agriculture only!'));
        
        // Try to get real-time weather data
        const weatherResponse = await axios.get(`${API_BASE}/weather/current`);
        if (weatherResponse.data.success && weatherResponse.data.data.weather) {
          const weather = weatherResponse.data.data.weather;
          console.log(chalk.green('\n🌤️ REAL-TIME WEATHER DATA:'));
          console.log(chalk.white(`   Temperature: ${weather.data.temperature}°C`));
          console.log(chalk.white(`   Conditions: ${weather.data.conditions}`));
          console.log(chalk.white(`   Humidity: ${weather.data.humidity}%`));
          console.log(chalk.white(`   Wind: ${weather.data.windSpeed} km/h`));
          console.log(chalk.white(`   Kale Farming Score: ${weather.score}/100`));
          console.log(chalk.white(`   Outlook: ${weather.interpretation?.farmingOutlook || 'unknown'}`));
          console.log(chalk.gray(`   Source: ${weather.source}`));
        }
      }
    } catch (error) {
      console.log(chalk.blue('🌍 Location selection and weather fetch in progress...'));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(chalk.yellow(`👨‍🌾 ${this.users[0].username} continues agriculture work...`));
    await this.submitUserAction(this.users[0].userId, 'agriculture', {
      agricultureType: 'store',
      stakeAmount: 25
    });

    console.log(chalk.green('✅ Working phase completed'));
  }

  private async demonstrateRevealingPhase(): Promise<void> {
    console.log(chalk.green.bold('\n🎭 PHASE 3: REVEALING - Complete Weather Resolution'));
    await this.waitForPhase('revealing');

    console.log(chalk.blue('🧮 COMPREHENSIVE WEATHER CALCULATION IN PROGRESS...'));
    console.log(chalk.gray('   🎯 Step 1: Gathering DAO consensus (Bull, Bear, Technical, Sentiment)'));
    console.log(chalk.gray('   🌤️  Step 2: Analyzing real weather data for selected location'));
    console.log(chalk.gray('   📊 Step 3: Processing community wager influence'));
    console.log(chalk.gray('   ⚡ Step 4: Applying final weather formula'));
    
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Try to get comprehensive weather calculation
    try {
      const calcResponse = await axios.get(`${API_BASE}/weather-calculation/current`);
      if (calcResponse.data.success) {
        const calc = calcResponse.data.data;
        
        console.log(chalk.cyan('\n🧮 FINAL WEATHER CALCULATION RESULTS:'));
        console.log(chalk.white(`   🌦️  Final Outcome: ${calc.weatherOutcome} WEATHER`));
        console.log(chalk.white(`   📊 Final Score: ${calc.finalScore}/100`));
        console.log(chalk.white(`   🎯 Confidence: ${(calc.confidence * 100).toFixed(1)}%`));
        
        console.log(chalk.yellow('\n📋 COMPONENT BREAKDOWN:'));
        console.log(chalk.white(`   🎯 DAO Consensus: ${calc.components.daoConsensus.score.toFixed(1)} (weight: ${calc.components.daoConsensus.weight})`));
        console.log(chalk.white(`   🌤️  Real Weather: ${calc.components.realWeather.score.toFixed(1)} (weight: ${calc.components.realWeather.weight})`));
        console.log(chalk.white(`   📊 Wager Influence: ${calc.components.communityWagers.score.toFixed(1)} (weight: ${calc.components.communityWagers.weight})`));
        
        console.log(chalk.blue(`\n🔢 FORMULA: ${calc.formula.calculation}`));
        console.log(chalk.gray(`   Location: ${calc.metadata.location || 'Unknown'}`));
        
        // Show which side won wagers
        if (calc.components.communityWagers.wagerData) {
          const wagerData = calc.components.communityWagers.wagerData;
          const winnerSide = calc.weatherOutcome === 'GOOD' ? 'GOOD' : 'BAD';
          console.log(chalk.yellow(`\n💰 WAGER RESULTS: ${winnerSide} weather bettors win!`));
          console.log(chalk.white(`   Prize Pool: ${wagerData.totalStakes} KALE`));
          console.log(chalk.white(`   Winners: ${winnerSide === 'GOOD' ? 'Good' : 'Bad'} weather bettors`));
        }
      }
      
    } catch (error) {
      console.log(chalk.gray('Weather calculation still in progress...'));
    }

    console.log(chalk.green('✅ Weather resolution completed'));
  }

  private async demonstrateSettlingPhase(): Promise<void> {
    console.log(chalk.green.bold('\n💰 PHASE 4: SETTLING'));
    await this.waitForPhase('settling');

    console.log(chalk.yellow('⚡ Distributing rewards...'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(chalk.green('✅ Cycle completed!'));
  }

  private async waitForPhase(targetPhase: string): Promise<void> {
    console.log(chalk.gray(`⏳ Waiting for ${targetPhase} phase...`));
    
    let attempts = 0;
    while (attempts < 60) {
      try {
        const response = await axios.get(`${API_BASE}/cycles/current`);
        if (response.data.success && response.data.data.cycle) {
          const cycle = response.data.data.cycle;
          if (cycle.phase === targetPhase) {
            this.currentCycle = cycle;
            return;
          }
        }
      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`));
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }
    
    throw new Error(`Timeout waiting for ${targetPhase} phase`);
  }

  private async submitUserAction(userId: string, actionType: string, actionData: ActionData): Promise<void> {
    try {
      const response = await axios.post(`${API_BASE}/cycles/action`, {
        userId,
        actionType,
        actionData
      });

      if (response.data.success) {
        console.log(chalk.green(`   ✓ Action submitted`));
      } else {
        console.log(chalk.red(`   ✗ Failed: ${response.data.error}`));
      }
    } catch (error: any) {
      console.log(chalk.red(`   ✗ Error: ${error.response?.data?.error || error.message}`));
    }
  }

  private async displayCycleStatus(): Promise<void> {
    try {
      const response = await axios.get(`${API_BASE}/cycles/current`);
      if (response.data.success && response.data.data.cycle) {
        const cycle = response.data.data.cycle;
        console.log(chalk.cyan(`\n📊 CYCLE ${cycle.cycleId}:`));
        console.log(chalk.white(`   Phase: ${cycle.phase.toUpperCase()}`));
        console.log(chalk.white(`   Block: ${cycle.currentBlock}`));
      }
    } catch (error) {
      console.log(chalk.red('Status unavailable'));
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Cleaning up...'));
    
    this.servers.forEach(server => {
      try {
        server.kill('SIGTERM');
      } catch (error) {
        // Silent cleanup
      }
    });

    console.log(chalk.green('✅ Demo cleanup completed'));
  }
}

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Demo interrupted'));
  process.exit(0);
});

const demo = new WeatherFarmingDemo();
demo.start().catch((error: any) => {
  console.error(chalk.red('Demo failed:'), error.message);
  process.exit(1);
});