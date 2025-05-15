const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const { testConnection } = require('./config/db');
const emailService = require('./services/emailService');
const webhookController = require('./controllers/webhookController');
const reportController = require('./controllers/reportController');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Yieldera Reporting Service',
    status: 'running'
  });
});

// Webhook endpoint for new field notifications
app.post('/api/webhook/field/new', webhookController.handleNewField);

// Manual report generation endpoints (protected with basic auth in production)
app.get('/api/reports/generate/:field_id', reportController.generateReport);
app.get('/api/reports/generate-all', reportController.generateAllReports);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  const emailStatus = await emailService.testEmailConfig();
  
  res.json({
    service: 'Yieldera Reporting Service',
    status: 'running',
    database: dbStatus ? 'connected' : 'disconnected',
    email: emailStatus ? 'configured' : 'error',
    timestamp: new Date().toISOString()
  });
});

// Schedule weekly summary reports (Sunday at 6am)
cron.schedule('0 6 * * 0', async () => {
  console.log('Running weekly report generation');
  try {
    // Get all fields
    const db = require('./config/db');
    const [fields] = await db.pool.query('SELECT id FROM fields');
    
    // Generate reports sequentially to avoid overwhelming the system
    for (const field of fields) {
      try {
        await require('./services/reportService').generateAndSendReport(field.id);
        console.log(`Generated report for field ID: ${field.id}`);
        // Small delay between reports
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error generating report for field ID ${field.id}:`, error);
      }
    }
    
    console.log('Weekly report generation completed');
  } catch (error) {
    console.error('Error in weekly report generation:', error);
  }
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Test database connection
  await testConnection();
  
  // Test email configuration
  await emailService.testEmailConfig();
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

module.exports = app;
