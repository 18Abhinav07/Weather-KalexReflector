#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import axios, { AxiosResponse } from 'axios';
import Table from 'cli-table3';
import ora, { Ora } from 'ora';
import boxen from 'boxen';
import { createInterface } from 'readline';

interface User {
  userId: string;
  username: string;
  custodialWallet: {
    publicKey: string;
    privateKey: string;
  };
  balance: {
    currentBalance: number;
    activePositions: number;
    totalStaked: number;
  };
}

interface Cycle {
  cycleId: string;
  phase: 'planting' | 'working' | 'revealing' | 'settling';
  currentBlock: string;
  blocksRemaining: number;
  startBlock: string;
}

interface CycleData {
  cycle: Cycle;
  participants?: {
    total_participants: number;
    farmers: number;
    wagerers: number;
  };
  daoSentiment?: {
    bullishPercentage: number;
  };
  revealedLocation?: {
    name: string;
    coordinates: {
      lat: number;
      lon: number;
    };
  };
}

interface ActionData {
  agricultureType?: 'plant' | 'store';
  stakeAmount?: number;
  wagerType?: 'good' | 'bad';
  wagerAmount?: number;
}

interface PhaseInfo {
  icon: string;
  name: string;
  description: string;
}

class WeatherFarmingCLI {
  private baseURL: string;
  private userId: string | null = null;
  private username: string | null = null;
  private currentCycle: CycleData | null = null;
  private isMonitoring: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.baseURL = process.env.API_URL || 'http://localhost:3000/api';
  }

  async start(): Promise<void> {
    console.clear();
    this.displayBanner();
    
    await this.checkServerConnection();
    await this.handleUserAuth();
    await this.mainLoop();
  }

  displayBanner(): void {
    const banner = chalk.cyan.bold(`
    ╔═══════════════════════════════════════╗
    ║     KALE Weather Farming System       ║
    ║     Interactive CLI Client            ║
    ╚═══════════════════════════════════════╝
    `);
    console.log(banner);
  }

  async checkServerConnection(): Promise<void> {
    const spinner: Ora = ora('Connecting to backend server...').start();
    
    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL.replace('/api', '')}/health`, {
        timeout: 5000
      });
      
      if (response.data.success) {
        spinner.succeed('Connected to KALE Weather Farming backend');
      } else {
        spinner.fail('Server health check failed');
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(`Failed to connect to server: ${error.message}`);
      console.log(chalk.yellow('Make sure the backend server is running on localhost:3000'));
      process.exit(1);
    }
  }

  async handleUserAuth(): Promise<void> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Welcome to Weather Farming. What would you like to do?',
        choices: [
          { name: 'Register new user account', value: 'register' },
          { name: 'Login with existing user ID', value: 'login' },
          { name: 'Demo mode (random user)', value: 'demo' }
        ]
      }
    ]);

    switch (action) {
      case 'register':
        await this.registerUser();
        break;
      case 'login':
        await this.loginUser();
        break;
      case 'demo':
        await this.createDemoUser();
        break;
    }
  }

  async registerUser(): Promise<void> {
    const { username, email } = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Enter username:',
        validate: (input: string) => input.length >= 3 ? true : 'Username must be at least 3 characters'
      },
      {
        type: 'input',
        name: 'email',
        message: 'Enter email:',
        validate: (input: string) => input.includes('@') ? true : 'Please enter a valid email'
      }
    ]);

    const spinner: Ora = ora('Creating user account with custodial wallet...').start();

    try {
      const response: AxiosResponse = await axios.post(`${this.baseURL}/users/register`, {
        username,
        email
      });

      if (response.data.success) {
        const userData: User = response.data.data;
        this.userId = userData.userId;
        this.username = userData.username;
        
        spinner.succeed('Account created successfully!');
        
        console.log(boxen(
          chalk.green('Account Details:') + '\n' +
          chalk.white(`User ID: ${this.userId}\n`) +
          chalk.white(`Username: ${this.username}\n`) +
          chalk.white(`Custodial Wallet: ${userData.custodialWallet.publicKey}\n`) +
          chalk.yellow('Save your User ID for future logins!'),
          { padding: 1, borderColor: 'green' }
        ));

      } else {
        spinner.fail(`Registration failed: ${response.data.error}`);
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(`Registration error: ${error.response?.data?.error || error.message}`);
      process.exit(1);
    }
  }

  async loginUser(): Promise<void> {
    const { userId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userId',
        message: 'Enter your User ID:',
        validate: (input: string) => input.length > 0 ? true : 'User ID is required'
      }
    ]);

    const spinner: Ora = ora('Fetching user profile...').start();

    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL}/users/${userId}`);

      if (response.data.success) {
        const userData: User = response.data.data;
        this.userId = userData.userId;
        this.username = userData.username;
        
        spinner.succeed(`Welcome back, ${this.username}!`);
        
        console.log(boxen(
          chalk.green('Account Status:') + '\n' +
          chalk.white(`Balance: ${userData.balance.currentBalance} KALE\n`) +
          chalk.white(`Active Positions: ${userData.balance.activePositions}\n`) +
          chalk.white(`Total Staked: ${userData.balance.totalStaked} KALE`),
          { padding: 1, borderColor: 'blue' }
        ));

      } else {
        spinner.fail(`Login failed: ${response.data.error}`);
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(`Login error: ${error.response?.data?.error || error.message}`);
      process.exit(1);
    }
  }

  async createDemoUser(): Promise<void> {
    const demoUsername: string = `demo_${Math.random().toString(36).substring(7)}`;
    const demoEmail: string = `${demoUsername}@demo.local`;

    const spinner: Ora = ora('Creating demo account...').start();

    try {
      const response: AxiosResponse = await axios.post(`${this.baseURL}/users/register`, {
        username: demoUsername,
        email: demoEmail
      });

      if (response.data.success) {
        const userData: User = response.data.data;
        this.userId = userData.userId;
        this.username = userData.username;
        
        spinner.succeed('Demo account created!');
        
        console.log(boxen(
          chalk.yellow('Demo Mode Active') + '\n' +
          chalk.white(`Demo User: ${this.username}\n`) +
          chalk.white(`User ID: ${this.userId}\n`) +
          chalk.gray('This is a temporary account for testing'),
          { padding: 1, borderColor: 'yellow' }
        ));

      } else {
        spinner.fail(`Demo setup failed: ${response.data.error}`);
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(`Demo setup error: ${error.response?.data?.error || error.message}`);
      process.exit(1);
    }
  }

  async mainLoop(): Promise<void> {
    while (true) {
      await this.fetchCurrentCycle();
      await this.displayCycleStatus();
      
      const action: string = await this.getMainMenuChoice();
      
      switch (action) {
        case 'participate':
          await this.handleParticipation();
          break;
        case 'view_positions':
          await this.viewUserPositions();
          break;
        case 'view_history':
          await this.viewTransactionHistory();
          break;
        case 'dao_stats':
          await this.viewDAOStatistics();
          break;
        case 'monitor':
          await this.startRealTimeMonitoring();
          break;
        case 'exit':
          console.log(chalk.green('Thanks for using KALE Weather Farming!'));
          process.exit(0);
        default:
          continue;
      }
    }
  }

  async fetchCurrentCycle(): Promise<void> {
    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL}/cycles/current`);
      if (response.data.success) {
        this.currentCycle = response.data.data;
      } else {
        this.currentCycle = null;
      }
    } catch (error: any) {
      console.log(chalk.red(`Failed to fetch cycle data: ${error.message}`));
      this.currentCycle = null;
    }
  }

  async displayCycleStatus(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    
    if (!this.currentCycle || !this.currentCycle.cycle) {
      console.log(chalk.yellow('⏳ No active weather cycle at the moment'));
      console.log(chalk.gray('Waiting for next cycle to begin...'));
      return;
    }

    const cycle: Cycle = this.currentCycle.cycle;
    const blockInCycle: number = parseInt(cycle.currentBlock) - parseInt(cycle.startBlock);
    const phaseInfo: PhaseInfo = this.getPhaseInfo(cycle.phase, blockInCycle);
    
    console.log(chalk.cyan.bold(`🌾 WEATHER CYCLE ${cycle.cycleId}`));
    console.log(chalk.white(`${phaseInfo.icon} ${phaseInfo.name} - Block ${blockInCycle + 1}/10`));
    console.log(chalk.gray(`Phase: ${cycle.phase} | Blocks remaining: ${cycle.blocksRemaining}`));
    
    if (this.currentCycle.participants) {
      const p = this.currentCycle.participants;
      console.log(chalk.white(`Participants: ${p.total_participants} | Farmers: ${p.farmers} | Wagerers: ${p.wagerers}`));
    }

    if (this.currentCycle.daoSentiment && cycle.phase === 'planting') {
      console.log(chalk.green(`📊 DAO Sentiment: ${this.currentCycle.daoSentiment.bullishPercentage}% Bullish`));
    }

    // Show revealed location during working, revealing, and settling phases
    if (this.currentCycle.revealedLocation && ['working', 'revealing', 'settling'].includes(cycle.phase)) {
      const loc = this.currentCycle.revealedLocation;
      console.log(chalk.cyan(`🌍 Location: ${loc.name} (${loc.coordinates.lat}, ${loc.coordinates.lon})`));
      
      // Try to fetch and display weather data
      try {
        const weatherResponse = await axios.get(`${this.baseURL}/weather/current`);
        if (weatherResponse.data.success && weatherResponse.data.data.weather) {
          const weather = weatherResponse.data.data.weather;
          console.log(chalk.green(`🌤️ Weather: ${weather.data.temperature}°C, ${weather.data.conditions} (Score: ${weather.score}/100)`));
        }
      } catch (error) {
        // Silently ignore weather fetch errors in CLI status display
      }
    }

    console.log(chalk.yellow(`⚡ ${phaseInfo.description}`));
    console.log('='.repeat(60));
  }

  getPhaseInfo(phase: string, blockInCycle: number): PhaseInfo {
    switch (phase) {
      case 'planting':
        return {
          icon: '🌱',
          name: 'PLANTING PHASE',
          description: 'You can plant crops or place weather wagers. DAO sentiment analysis available.'
        };
      case 'working':
        return {
          icon: '🔨',
          name: 'AGRICULTURE ONLY PHASE',
          description: 'Location revealed at block 6! Weather wagers closed - agriculture only.'
        };
      case 'revealing':
        return {
          icon: '🎭',
          name: 'REVEALING PHASE',
          description: 'Weather consensus being calculated via weighted DAO voting.'
        };
      case 'settling':
        return {
          icon: '💰',
          name: 'SETTLEMENT PHASE',
          description: 'Weather announced! Applying modifiers and distributing rewards.'
        };
      default:
        return {
          icon: '⏳',
          name: 'WAITING',
          description: 'Preparing for next cycle...'
        };
    }
  }

  async getMainMenuChoice(): Promise<string> {
    const choices = [
      { name: '🎯 Participate in current cycle', value: 'participate' },
      { name: '📊 View my farming positions', value: 'view_positions' },
      { name: '📜 View transaction history', value: 'view_history' },
      { name: '🤖 View DAO statistics', value: 'dao_stats' },
      { name: '📡 Start real-time monitoring', value: 'monitor' },
      { name: '🚪 Exit', value: 'exit' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    return action;
  }

  async handleParticipation(): Promise<void> {
    if (!this.currentCycle || !this.currentCycle.cycle) {
      console.log(chalk.yellow('No active cycle for participation'));
      return;
    }

    const cycle: Cycle = this.currentCycle.cycle;
    const availableActions = this.getAvailableActions(cycle.phase);

    if (availableActions.length === 0) {
      console.log(chalk.yellow(`No actions available during ${cycle.phase} phase`));
      return;
    }

    const { actionType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'actionType',
        message: 'Choose your action for this cycle:',
        choices: availableActions
      }
    ]);

    switch (actionType) {
      case 'agriculture':
        await this.handleAgricultureAction();
        break;
      case 'wager':
        await this.handleWagerAction();
        break;
      case 'stay':
        await this.handleStayAction();
        break;
    }
  }

  getAvailableActions(phase: string): Array<{ name: string; value: string }> {
    switch (phase) {
      case 'planting':
        return [
          { name: '🚜 Agriculture (plant or store)', value: 'agriculture' },
          { name: '🎰 Weather wager (bet on outcome)', value: 'wager' },
          { name: '⏸️ Stay (no action this block)', value: 'stay' }
        ];
      case 'working':
        return [
          { name: '🚜 Agriculture only', value: 'agriculture' },
          { name: '⏸️ Stay (no action this block)', value: 'stay' }
        ];
      case 'revealing':
      case 'settling':
        return [
          { name: '⏸️ Wait for results', value: 'stay' }
        ];
      default:
        return [];
    }
  }

  async handleAgricultureAction(): Promise<void> {
    const { agricultureType, stakeAmount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'agricultureType',
        message: 'Choose agriculture strategy:',
        choices: [
          { name: '🌱 Plant (stake for weather-based rewards)', value: 'plant' },
          { name: '🏦 Store (safe custodial holding)', value: 'store' }
        ]
      },
      {
        type: 'input',
        name: 'stakeAmount',
        message: 'Enter KALE amount to stake:',
        validate: (input: string) => {
          const amount = parseInt(input);
          return amount > 0 ? true : 'Amount must be greater than 0';
        }
      }
    ]);

    await this.submitAction('agriculture', { agricultureType, stakeAmount });
  }

  async handleWagerAction(): Promise<void> {
    const { wagerType, wagerAmount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'wagerType',
        message: 'Bet on weather outcome:',
        choices: [
          { name: '☀️ Good weather (DAOs will influence positive outcome)', value: 'good' },
          { name: '🌧️ Bad weather (DAOs will influence negative outcome)', value: 'bad' }
        ]
      },
      {
        type: 'input',
        name: 'wagerAmount',
        message: 'Enter wager amount in KALE:',
        validate: (input: string) => {
          const amount = parseInt(input);
          return amount > 0 ? true : 'Amount must be greater than 0';
        }
      }
    ]);

    await this.submitAction('wager', { wagerType, wagerAmount });
  }

  async handleStayAction(): Promise<void> {
    await this.submitAction('stay', {});
  }

  async submitAction(actionType: string, actionData: ActionData): Promise<void> {
    const spinner: Ora = ora(`Submitting ${actionType} action...`).start();

    try {
      const response: AxiosResponse = await axios.post(`${this.baseURL}/cycles/action`, {
        userId: this.userId,
        actionType,
        actionData
      });

      if (response.data.success) {
        spinner.succeed('Action submitted successfully!');
        
        const result = response.data.data;
        console.log(boxen(
          chalk.green('Action Confirmed') + '\n' +
          chalk.white(`Action: ${actionType}\n`) +
          chalk.white(`Cycle: ${result.cycle.cycleId}\n`) +
          chalk.white(`Block: ${result.cycle.currentBlock}\n`) +
          chalk.gray('Your action has been recorded for this cycle'),
          { padding: 1, borderColor: 'green' }
        ));

      } else {
        spinner.fail(`Action failed: ${response.data.error}`);
      }
    } catch (error: any) {
      spinner.fail(`Action error: ${error.response?.data?.error || error.message}`);
    }
  }

  async viewUserPositions(): Promise<void> {
    const spinner: Ora = ora('Fetching your farming positions...').start();

    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL}/users/${this.userId}/positions`);

      if (response.data.success && response.data.data.length > 0) {
        spinner.succeed('Farming positions loaded');
        
        const table = new Table({
          head: ['Position ID', 'Cycle', 'Stake', 'Status', 'Weather', 'Final Reward'],
          style: { head: ['cyan'] }
        });

        response.data.data.forEach((position: any) => {
          table.push([
            position.positionId.substring(0, 8) + '...',
            position.cycleId || 'N/A',
            position.stakeAmount || '0',
            position.status || 'unknown',
            position.weatherOutcome || 'pending',
            position.finalReward || 'calculating...'
          ]);
        });

        console.log('\n' + table.toString());

      } else {
        spinner.succeed('No farming positions found');
        console.log(chalk.yellow('You haven\'t participated in any farming cycles yet'));
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch positions: ${error.message}`);
    }
  }

  async viewTransactionHistory(): Promise<void> {
    const spinner: Ora = ora('Fetching transaction history...').start();

    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL}/users/${this.userId}/transactions`);

      if (response.data.success && response.data.data.length > 0) {
        spinner.succeed('Transaction history loaded');
        
        const table = new Table({
          head: ['Date', 'Type', 'Amount', 'Status', 'Cycle'],
          style: { head: ['cyan'] }
        });

        response.data.data.forEach((tx: any) => {
          table.push([
            new Date(tx.createdAt).toLocaleDateString(),
            tx.transactionType,
            tx.amount || '0',
            'completed',
            tx.relatedCycleId || 'N/A'
          ]);
        });

        console.log('\n' + table.toString());

      } else {
        spinner.succeed('No transactions found');
        console.log(chalk.yellow('No transaction history available'));
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch transactions: ${error.message}`);
    }
  }

  async viewDAOStatistics(): Promise<void> {
    const spinner: Ora = ora('Fetching DAO performance statistics...').start();

    try {
      const response: AxiosResponse = await axios.get(`${this.baseURL}/weather/statistics`);

      if (response.data.success) {
        spinner.succeed('DAO statistics loaded');
        
        const stats = response.data.data;
        console.log(boxen(
          chalk.cyan('Weather System Statistics') + '\n' +
          chalk.white(`Total Cycles Settled: ${stats.totalCyclesSettled}\n`) +
          chalk.green(`Good Weather Cycles: ${stats.goodWeatherCycles}\n`) +
          chalk.red(`Bad Weather Cycles: ${stats.badWeatherCycles}\n`) +
          chalk.yellow(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%\n`) +
          chalk.white(`Total Rewards Distributed: ${stats.totalRewardsDistributed} KALE`),
          { padding: 1, borderColor: 'cyan' }
        ));

      } else {
        spinner.fail('No statistics available');
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch DAO statistics: ${error.message}`);
    }
  }

  async startRealTimeMonitoring(): Promise<void> {
    console.log(chalk.cyan('🔄 Starting real-time cycle monitoring...'));
    console.log(chalk.gray('Press Ctrl+C to stop monitoring and return to menu'));

    this.isMonitoring = true;
    let lastBlock: string | null = null;

    const monitor = async (): Promise<void> => {
      try {
        const response: AxiosResponse = await axios.get(`${this.baseURL}/cycles/live-feed`);
        
        if (response.data.success) {
          const feed = response.data.data;
          
          if (feed.cycle && feed.cycle.currentBlock !== lastBlock) {
            lastBlock = feed.cycle.currentBlock;
            
            console.log('\n' + '─'.repeat(50));
            console.log(chalk.yellow(`📡 Block ${feed.cycle.currentBlock} | Cycle ${feed.cycle.cycleId}`));
            console.log(chalk.white(`Phase: ${feed.cycle.phase} | ${feed.cycle.blocksRemaining} blocks remaining`));
            
            if (feed.prompt) {
              console.log(chalk.green(`💡 ${feed.prompt.message}`));
              if (feed.prompt.actions && feed.prompt.actions.length > 0) {
                console.log(chalk.gray(`Available actions: ${feed.prompt.actions.map((a: any) => a.label).join(', ')}`));
              }
            }
          }
        }
      } catch (error: any) {
        console.log(chalk.red(`Monitoring error: ${error.message}`));
      }
    };

    this.monitorInterval = setInterval(monitor, 5000);
    
    // Handle Ctrl+C to stop monitoring
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    process.on('SIGINT', () => {
      this.stopMonitoring();
      rl.close();
    });

    // Keep monitoring until user interrupts
    await new Promise<void>(resolve => {
      process.once('SIGINT', resolve);
    });
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log('\n' + chalk.cyan('Monitoring stopped. Returning to menu...'));
  }
}

// Start the CLI application
const cli = new WeatherFarmingCLI();
cli.start().catch((error: any) => {
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});