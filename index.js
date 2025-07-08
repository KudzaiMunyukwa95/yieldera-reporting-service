const express = require('express');
const mysql = require('mysql2/promise');
const cron = require('cron');
require('dotenv').config();

const ReportService = require('./services/reportService');
const EmailService = require('./services/emailService');
const WeatherService = require('./services/weatherService');
const DatabaseService = require('./services/databaseService');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Yieldera Reporting Service'
  });
});

// Status endpoint
app.get('/status', async (req, res) => {
  try {
    const dbService = new DatabaseService();
    const queueCount = await dbService.getQueueCount();
    
    res.status(200).json({
      status: 'running',
      timestamp: new Date().toISOString(),
      pendingReports: queueCount,
      lastProcessed: global.lastProcessedTime || 'Not yet processed'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Initialize services
let reportService;
let emailService;
let weatherService;
let dbService;

async function initializeServices() {
  try {
    console.log('🚀 Initializing Yieldera Reporting Service...');
    
    dbService = new DatabaseService();
    await dbService.testConnection();
    console.log('✅ Database connection established');
    
    emailService = new EmailService();
    await emailService.testConnection();
    console.log('✅ Email service initialized');
    
    weatherService = new WeatherService();
    console.log('✅ Weather service initialized');
    
    reportService = new ReportService(dbService, emailService, weatherService);
    console.log('✅ Report service initialized');
    
    // Process any pending reports on startup
    await processReports();
    
    // Set up cron job to process reports every 2 minutes
    const job = new cron.CronJob('*/2 * * * *', async () => {
      await processReports();
    });
    job.start();
    console.log('✅ Report processing cron job started (every 2 minutes)');
    
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

async function processReports() {
  try {
    console.log('🔄 Processing pending reports...');
    const result = await reportService.processPendingReports();
    
    if (result.processed > 0) {
      console.log(`✅ Processed ${result.processed} reports successfully`);
      if (result.errors > 0) {
        console.log(`⚠️ ${result.errors} reports had errors`);
      }
    }
    
    global.lastProcessedTime = new Date().toISOString();
    
  } catch (error) {
    console.error('❌ Error processing reports:', error);
  }
}

// Manual trigger endpoint for testing (accepts both GET and POST)
app.get('/trigger-reports', async (req, res) => {
  try {
    console.log('📧 Manual report trigger initiated via GET...');
    const result = await reportService.processPendingReports();
    
    res.status(200).json({
      success: true,
      message: `Processed ${result.processed} reports`,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Manual trigger error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/trigger-reports', async (req, res) => {
  try {
    console.log('📧 Manual report trigger initiated via POST...');
    const result = await reportService.processPendingReports();
    
    res.status(200).json({
      success: true,
      message: `Processed ${result.processed} reports`,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Manual trigger error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🌟 Yieldera Reporting Service running on port ${PORT}`);
  initializeServices();
});

module.exports = app;
