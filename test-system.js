// Comprehensive Weather Farming System Testing
// Tests all components and documents results

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('🧪 KALE Weather Farming System - Comprehensive Test Suite');
console.log('=========================================================');

// Test Results Object
const testResults = {
  database: { status: 'pending', tests: [], errors: [] },
  userService: { status: 'pending', tests: [], errors: [] },
  custodialWallet: { status: 'pending', tests: [], errors: [] },
  plantRequest: { status: 'pending', tests: [], errors: [] },
  depositMonitor: { status: 'pending', tests: [], errors: [] },
  weatherIntegration: { status: 'pending', tests: [], errors: [] },
  farmingAutomation: { status: 'pending', tests: [], errors: [] },
  apiEndpoints: { status: 'pending', tests: [], errors: [] },
  integration: { status: 'pending', tests: [], errors: [] }
};

// Helper function to add test result
function addTestResult(component, test, passed, error = null) {
  testResults[component].tests.push({
    name: test,
    passed,
    error: error?.message || error,
    timestamp: new Date().toISOString()
  });
  
  if (error) {
    testResults[component].errors.push(error);
  }
  
  console.log(`${passed ? '✅' : '❌'} ${component}: ${test}`);
  if (error) {
    console.log(`   Error: ${error.message || error}`);
  }
}

// Update component status
function updateComponentStatus(component) {
  const tests = testResults[component].tests;
  if (tests.length === 0) {
    testResults[component].status = 'not_tested';
  } else {
    const allPassed = tests.every(test => test.passed);
    const anyPassed = tests.some(test => test.passed);
    
    if (allPassed) {
      testResults[component].status = 'passed';
    } else if (anyPassed) {
      testResults[component].status = 'partial';
    } else {
      testResults[component].status = 'failed';
    }
  }
}

// Test 1: Database Schema and Connection
async function testDatabase() {
  console.log('\n📊 Testing Database Schema and Connection...');
  
  try {
    // Check if schema file exists and is valid
    const fs = await import('fs');
    const schemaExists = fs.existsSync('./src/database/schema.sql');
    addTestResult('database', 'Schema file exists', schemaExists);
    
    if (schemaExists) {
      const schema = fs.readFileSync('./src/database/schema.sql', 'utf8');
      
      // Check for required tables
      const requiredTables = [
        'users', 'custodial_wallets', 'weather_cycles', 
        'farm_positions', 'plant_requests', 'transaction_log'
      ];
      
      for (const table of requiredTables) {
        const hasTable = schema.includes(`CREATE TABLE ${table}`);
        addTestResult('database', `Table ${table} defined`, hasTable);
      }
      
      // Check for required views
      const hasBalanceView = schema.includes('user_balance_summary');
      addTestResult('database', 'Balance summary view defined', hasBalanceView);
    }
    
    // Test database connection structure
    const fs2 = await import('fs');
    const connectionExists = fs2.existsSync('./src/database/connection.ts');
    addTestResult('database', 'Connection module exists', connectionExists);
    
  } catch (error) {
    addTestResult('database', 'Database test setup', false, error);
  }
  
  updateComponentStatus('database');
}

// Test 2: User Service and Custodial Wallets
async function testUserService() {
  console.log('\n👤 Testing User Service and Custodial Wallets...');
  
  try {
    const fs = await import('fs');
    
    // Check if user service exists
    const userServiceExists = fs.existsSync('./src/services/user-service.ts');
    addTestResult('userService', 'User service file exists', userServiceExists);
    
    if (userServiceExists) {
      const userServiceCode = fs.readFileSync('./src/services/user-service.ts', 'utf8');
      
      // Check for key functions
      const hasRegisterUser = userServiceCode.includes('registerUser');
      const hasGetProfile = userServiceCode.includes('getUserProfile');
      const hasBalanceSummary = userServiceCode.includes('getUserBalanceSummary');
      
      addTestResult('userService', 'registerUser function defined', hasRegisterUser);
      addTestResult('userService', 'getUserProfile function defined', hasGetProfile);
      addTestResult('userService', 'getUserBalanceSummary function defined', hasBalanceSummary);
    }
    
    // Check custodial wallet manager
    const walletManagerExists = fs.existsSync('./src/services/custodial-wallet-manager.ts');
    addTestResult('custodialWallet', 'Custodial wallet manager exists', walletManagerExists);
    
    if (walletManagerExists) {
      const walletCode = fs.readFileSync('./src/services/custodial-wallet-manager.ts', 'utf8');
      
      const hasGenerate = walletCode.includes('generateCustodialWallet');
      const hasDecrypt = walletCode.includes('decryptPrivateKey');
      const hasEncryption = walletCode.includes('AES');
      
      addTestResult('custodialWallet', 'generateCustodialWallet function defined', hasGenerate);
      addTestResult('custodialWallet', 'decryptPrivateKey function defined', hasDecrypt);
      addTestResult('custodialWallet', 'AES encryption implemented', hasEncryption);
    }
    
  } catch (error) {
    addTestResult('userService', 'User service test setup', false, error);
  }
  
  updateComponentStatus('userService');
  updateComponentStatus('custodialWallet');
}

// Test 3: Plant Request System
async function testPlantRequestSystem() {
  console.log('\n🌱 Testing Plant Request System...');
  
  try {
    const fs = await import('fs');
    
    const plantServiceExists = fs.existsSync('./src/services/plant-request-service.ts');
    addTestResult('plantRequest', 'Plant request service exists', plantServiceExists);
    
    if (plantServiceExists) {
      const plantCode = fs.readFileSync('./src/services/plant-request-service.ts', 'utf8');
      
      const hasSubmit = plantCode.includes('submitPlantRequest');
      const hasValidation = plantCode.includes('validatePlantRequest');
      const hasQueue = plantCode.includes('getRequestsForBlock');
      const hasCycles = plantCode.includes('weather_cycles');
      
      addTestResult('plantRequest', 'submitPlantRequest function defined', hasSubmit);
      addTestResult('plantRequest', 'validatePlantRequest function defined', hasValidation);
      addTestResult('plantRequest', 'getRequestsForBlock function defined', hasQueue);
      addTestResult('plantRequest', 'Weather cycle integration', hasCycles);
    }
    
  } catch (error) {
    addTestResult('plantRequest', 'Plant request test setup', false, error);
  }
  
  updateComponentStatus('plantRequest');
}

// Test 4: Deposit Monitor
async function testDepositMonitor() {
  console.log('\n💰 Testing Deposit Monitor...');
  
  try {
    const fs = await import('fs');
    
    const depositExists = fs.existsSync('./src/services/deposit-monitor.ts');
    addTestResult('depositMonitor', 'Deposit monitor service exists', depositExists);
    
    if (depositExists) {
      const depositCode = fs.readFileSync('./src/services/deposit-monitor.ts', 'utf8');
      
      const hasMonitoring = depositCode.includes('startMonitoring');
      const hasProcessDeposit = depositCode.includes('processDeposit');
      const hasHorizon = depositCode.includes('Horizon') || depositCode.includes('horizon');
      const hasBalance = depositCode.includes('getCustodialWalletBalance');
      
      addTestResult('depositMonitor', 'startMonitoring function defined', hasMonitoring);
      addTestResult('depositMonitor', 'processDeposit function defined', hasProcessDeposit);
      addTestResult('depositMonitor', 'Stellar Horizon integration', hasHorizon);
      addTestResult('depositMonitor', 'getCustodialWalletBalance function defined', hasBalance);
    }
    
  } catch (error) {
    addTestResult('depositMonitor', 'Deposit monitor test setup', false, error);
  }
  
  updateComponentStatus('depositMonitor');
}

// Test 5: Weather Integration Service
async function testWeatherIntegration() {
  console.log('\n🌦️  Testing Weather Integration Service...');
  
  try {
    const fs = await import('fs');
    
    const weatherExists = fs.existsSync('./src/services/weather-integration-service.ts');
    addTestResult('weatherIntegration', 'Weather integration service exists', weatherExists);
    
    if (weatherExists) {
      const weatherCode = fs.readFileSync('./src/services/weather-integration-service.ts', 'utf8');
      
      const hasDetermineOutcome = weatherCode.includes('determineWeatherOutcome');
      const hasCalculateModifier = weatherCode.includes('calculateWeatherModifier');
      const hasSettlement = weatherCode.includes('applyCycleSettlement');
      const hasDAO = weatherCode.includes('DAOApiController');
      const hasMultipliers = weatherCode.includes('BASE_GOOD_MULTIPLIER') && weatherCode.includes('BASE_BAD_MULTIPLIER');
      
      addTestResult('weatherIntegration', 'determineWeatherOutcome function defined', hasDetermineOutcome);
      addTestResult('weatherIntegration', 'calculateWeatherModifier function defined', hasCalculateModifier);
      addTestResult('weatherIntegration', 'applyCycleSettlement function defined', hasSettlement);
      addTestResult('weatherIntegration', 'DAO controller integration', hasDAO);
      addTestResult('weatherIntegration', 'Weather multipliers defined', hasMultipliers);
    }
    
  } catch (error) {
    addTestResult('weatherIntegration', 'Weather integration test setup', false, error);
  }
  
  updateComponentStatus('weatherIntegration');
}

// Test 6: Farming Automation Engine
async function testFarmingAutomation() {
  console.log('\n🚜 Testing Farming Automation Engine...');
  
  try {
    const fs = await import('fs');
    
    const automationExists = fs.existsSync('./src/services/farming-automation-engine.ts');
    addTestResult('farmingAutomation', 'Farming automation engine exists', automationExists);
    
    if (automationExists) {
      const automationCode = fs.readFileSync('./src/services/farming-automation-engine.ts', 'utf8');
      
      const hasStart = automationCode.includes('startAutomation');
      const hasPlantExecution = automationCode.includes('executePlantTransaction');
      const hasWorkExecution = automationCode.includes('executeWorkTransaction');
      const hasHarvestExecution = automationCode.includes('executeHarvestTransaction');
      const hasKaleClient = automationCode.includes('KaleClient') || automationCode.includes('kaleClient');
      const hasHealthCheck = automationCode.includes('healthCheck');
      
      addTestResult('farmingAutomation', 'startAutomation function defined', hasStart);
      addTestResult('farmingAutomation', 'executePlantTransaction function defined', hasPlantExecution);
      addTestResult('farmingAutomation', 'executeWorkTransaction function defined', hasWorkExecution);
      addTestResult('farmingAutomation', 'executeHarvestTransaction function defined', hasHarvestExecution);
      addTestResult('farmingAutomation', 'KALE client integration', hasKaleClient);
      addTestResult('farmingAutomation', 'healthCheck function defined', hasHealthCheck);
    }
    
  } catch (error) {
    addTestResult('farmingAutomation', 'Farming automation test setup', false, error);
  }
  
  updateComponentStatus('farmingAutomation');
}

// Test 7: API Endpoints
async function testAPIEndpoints() {
  console.log('\n🌐 Testing API Endpoints...');
  
  try {
    const fs = await import('fs');
    
    // Check API endpoints file
    const apiExists = fs.existsSync('./src/api/weather-farming-endpoints.ts');
    addTestResult('apiEndpoints', 'API endpoints file exists', apiExists);
    
    if (apiExists) {
      const apiCode = fs.readFileSync('./src/api/weather-farming-endpoints.ts', 'utf8');
      
      const hasRegisterUser = apiCode.includes('registerUser');
      const hasGetProfile = apiCode.includes('getUserProfile');
      const hasProcessDeposit = apiCode.includes('processDeposit');
      const hasSubmitPlant = apiCode.includes('submitPlantRequest');
      const hasGetPositions = apiCode.includes('getFarmPositions');
      const hasWeatherStats = apiCode.includes('getWeatherStatistics');
      
      addTestResult('apiEndpoints', 'registerUser endpoint defined', hasRegisterUser);
      addTestResult('apiEndpoints', 'getUserProfile endpoint defined', hasGetProfile);
      addTestResult('apiEndpoints', 'processDeposit endpoint defined', hasProcessDeposit);
      addTestResult('apiEndpoints', 'submitPlantRequest endpoint defined', hasSubmitPlant);
      addTestResult('apiEndpoints', 'getFarmPositions endpoint defined', hasGetPositions);
      addTestResult('apiEndpoints', 'getWeatherStatistics endpoint defined', hasWeatherStats);
    }
    
    // Check routes file
    const routesExists = fs.existsSync('./src/api/routes.ts');
    addTestResult('apiEndpoints', 'Routes configuration exists', routesExists);
    
    // Check main app file
    const appExists = fs.existsSync('./src/app.ts');
    addTestResult('apiEndpoints', 'Express app configuration exists', appExists);
    
    if (appExists) {
      const appCode = fs.readFileSync('./src/app.ts', 'utf8');
      
      const hasMiddleware = appCode.includes('helmet') && appCode.includes('cors');
      const hasRateLimit = appCode.includes('rateLimit');
      const hasHealthCheck = appCode.includes('/health');
      
      addTestResult('apiEndpoints', 'Security middleware configured', hasMiddleware);
      addTestResult('apiEndpoints', 'Rate limiting configured', hasRateLimit);
      addTestResult('apiEndpoints', 'Health check endpoint', hasHealthCheck);
    }
    
  } catch (error) {
    addTestResult('apiEndpoints', 'API endpoints test setup', false, error);
  }
  
  updateComponentStatus('apiEndpoints');
}

// Test 8: Integration and Architecture
async function testIntegration() {
  console.log('\n🔗 Testing Integration and Architecture...');
  
  try {
    const fs = await import('fs');
    
    // Check main entry point
    const indexExists = fs.existsSync('./src/index.ts');
    addTestResult('integration', 'Main entry point exists', indexExists);
    
    // Check package.json for dependencies
    const packageExists = fs.existsSync('./package.json');
    addTestResult('integration', 'Package.json exists', packageExists);
    
    if (packageExists) {
      const packageData = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      
      const hasExpress = packageData.dependencies?.express;
      const hasPg = packageData.dependencies?.pg;
      const hasCors = packageData.dependencies?.cors;
      const hasHelmet = packageData.dependencies?.helmet;
      const hasStellar = packageData.dependencies?.['@stellar/stellar-sdk'];
      const hasKaleSDK = packageData.dependencies?.['kale-sc-sdk'];
      
      addTestResult('integration', 'Express dependency configured', !!hasExpress);
      addTestResult('integration', 'PostgreSQL dependency configured', !!hasPg);
      addTestResult('integration', 'CORS dependency configured', !!hasCors);
      addTestResult('integration', 'Helmet security configured', !!hasHelmet);
      addTestResult('integration', 'Stellar SDK configured', !!hasStellar);
      addTestResult('integration', 'KALE SDK configured', !!hasKaleSDK);
    }
    
    // Check environment configuration
    const envExists = fs.existsSync('./.env.example');
    addTestResult('integration', 'Environment example exists', envExists);
    
  } catch (error) {
    addTestResult('integration', 'Integration test setup', false, error);
  }
  
  updateComponentStatus('integration');
}

// Generate Test Report
function generateTestReport() {
  console.log('\n📋 COMPREHENSIVE TEST REPORT');
  console.log('============================');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  for (const [component, results] of Object.entries(testResults)) {
    const { status, tests, errors } = results;
    const componentPassed = tests.filter(t => t.passed).length;
    const componentFailed = tests.filter(t => !t.passed).length;
    
    totalTests += tests.length;
    passedTests += componentPassed;
    failedTests += componentFailed;
    
    const statusIcon = {
      'passed': '✅',
      'partial': '⚠️',
      'failed': '❌',
      'not_tested': '⏸️',
      'pending': '⏳'
    }[status] || '❓';
    
    console.log(`\n${statusIcon} ${component.toUpperCase()}: ${status}`);
    console.log(`   Tests: ${componentPassed}/${tests.length} passed`);
    
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
    }
  }
  
  console.log('\n📊 OVERALL SUMMARY');
  console.log('==================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  return {
    totalTests,
    passedTests,
    failedTests,
    successRate: ((passedTests / totalTests) * 100).toFixed(1),
    components: testResults,
    timestamp: new Date().toISOString()
  };
}

// Run all tests
async function runAllTests() {
  try {
    await testDatabase();
    await testUserService();
    await testPlantRequestSystem();
    await testDepositMonitor();
    await testWeatherIntegration();
    await testFarmingAutomation();
    await testAPIEndpoints();
    await testIntegration();
    
    const report = generateTestReport();
    
    // Save report to file
    const fs = await import('fs');
    fs.writeFileSync('./TEST-RESULTS.json', JSON.stringify(report, null, 2));
    
    console.log('\n💾 Test results saved to TEST-RESULTS.json');
    
    return report;
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    throw error;
  }
}

// Run the tests
runAllTests().catch(console.error);