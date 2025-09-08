#!/usr/bin/env bun
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

class DemoMonitor {
  private lastBlock = 0;
  
  async start() {
    console.log('🔍 KALE Weather Farming Demo Monitor');
    console.log('=====================================');
    console.log('');
    
    const monitorInterval = setInterval(async () => {
      try {
        await this.checkStatus();
      } catch (error) {
        console.error('❌ Monitor error:', error.message);
      }
    }, 1000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(monitorInterval);
      console.log('\n🛑 Monitor stopped');
      process.exit(0);
    });
  }
  
  async checkStatus() {
    try {
      const health = await axios.get(`${API_BASE}/health`);
      const status = await axios.get(`${API_BASE}/cycle/status`);
      
      if (status.data.currentBlock !== this.lastBlock) {
        this.lastBlock = status.data.currentBlock;
        await this.showBlockUpdate(status.data);
      }
      
      // Show server health
      process.stdout.write(`\r⚡ Server: ${health.data.status} | Block: ${status.data.currentBlock}/10 | Phase: ${status.data.phase} | State: ${status.data.cycleState}`);
      
    } catch (error) {
      process.stdout.write(`\r❌ Server offline or unreachable`);
    }
  }
  
  async showBlockUpdate(status: any) {
    console.log(''); // New line
    console.log(`📍 BLOCK ${status.currentBlock} UPDATE`);
    console.log('─'.repeat(40));
    
    if (status.currentBlock === 1) {
      console.log('🎬 Demo started! Wager phase begins...');
    } else if (status.currentBlock === 6) {
      console.log(`🌍 Location: ${status.selectedLocation?.name || 'Unknown'}`);
      console.log('🌱 Agriculture phase started!');
    } else if (status.currentBlock === 9) {
      console.log('🗳️  Weather calculation in progress...');
    } else if (status.currentBlock === 10) {
      console.log('🏆 Final settlement - Demo completed!');
      await this.showFinalResults();
      process.exit(0);
    }
    
    // Show user actions for this block
    try {
      const users = [
        { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Alice', color: '\x1b[31m' },
        { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Bob', color: '\x1b[34m' },
        { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Charlie', color: '\x1b[33m' }
      ];
      
      for (const user of users) {
        try {
          const actions = await axios.get(`${API_BASE}/users/${user.id}/actions`);
          const blockAction = actions.data.actions.find((a: any) => a.blockNumber === status.currentBlock);
          
          if (blockAction) {
            const actionText = this.formatAction(blockAction);
            console.log(`${user.color}${user.name}: ${actionText}\x1b[0m`);
          } else {
            console.log(`${user.color}${user.name}: Staying put\x1b[0m`);
          }
        } catch (error) {
          console.log(`${user.color}${user.name}: No action data\x1b[0m`);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not fetch user actions');
    }
    
    console.log('');
  }
  
  formatAction(action: any): string {
    if (action.actionType === 'wager') {
      return `💰 Wager ${action.actionData.amount} KALE on ${action.actionData.direction.toUpperCase()}`;
    } else if (action.actionType === 'agriculture') {
      if (action.actionData.amount) {
        return `🌱 Plant ${action.actionData.amount} KALE`;
      } else if (action.actionData.work) {
        return `💪 Complete farm work`;
      }
    }
    return '⏸️  Stay';
  }
  
  async showFinalResults() {
    console.log('\n🎉 FINAL DEMO RESULTS');
    console.log('=====================');
    
    try {
      const results = await axios.get(`${API_BASE}/cycle/results`);
      console.log('Cycle ID:', results.data.cycleId);
      console.log('Total Actions:', results.data.totalActions);
      console.log('Completed At:', new Date(results.data.completedAt).toLocaleTimeString());
      
      if (results.data.finalResults) {
        console.log('\nUser Rewards:');
        for (const result of results.data.finalResults) {
          console.log(`- User ${result.userId}: ${result.type} - ${JSON.stringify(result)}`);
        }
      }
    } catch (error) {
      console.log('Could not fetch final results');
    }
  }
}

const monitor = new DemoMonitor();
monitor.start().catch(error => {
  console.error('Monitor failed to start:', error);
  process.exit(1);
});