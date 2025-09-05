// API Routes for Weather Farming System
// Express router configuration for all endpoints

import express from 'express';
import { weatherFarmingAPI } from './weather-farming-endpoints';

const router = express.Router();

// User Management Routes - REQ-001
router.post('/users/register', weatherFarmingAPI.registerUser.bind(weatherFarmingAPI));
router.get('/users/:userId', weatherFarmingAPI.getUserProfile.bind(weatherFarmingAPI));

// Deposit Management Routes - REQ-002  
router.post('/deposits', weatherFarmingAPI.processDeposit.bind(weatherFarmingAPI));

// Plant Request Routes - REQ-003
router.post('/plant-requests', weatherFarmingAPI.submitPlantRequest.bind(weatherFarmingAPI));
router.get('/plant-requests/:requestId', weatherFarmingAPI.getPlantRequestStatus.bind(weatherFarmingAPI));
router.get('/users/:userId/plant-requests', weatherFarmingAPI.getUserPlantRequests.bind(weatherFarmingAPI));

// Farm Position Routes - REQ-004, REQ-005, REQ-007
router.get('/users/:userId/positions', weatherFarmingAPI.getFarmPositions.bind(weatherFarmingAPI));

// Weather Integration Routes - REQ-006
router.get('/weather/cycles', weatherFarmingAPI.getWeatherCycles.bind(weatherFarmingAPI));
router.get('/weather/statistics', weatherFarmingAPI.getWeatherStatistics.bind(weatherFarmingAPI));

// System Status Routes
router.get('/status/automation', weatherFarmingAPI.getAutomationStatus.bind(weatherFarmingAPI));

// Transaction History Routes
router.get('/users/:userId/transactions', weatherFarmingAPI.getTransactionHistory.bind(weatherFarmingAPI));

// Withdrawal Routes - REQ-008 (placeholder)
router.post('/withdrawals', weatherFarmingAPI.requestWithdrawal.bind(weatherFarmingAPI));

export { router as weatherFarmingRoutes };