const { pool } = require('../config/db');
const weatherService = require('./weatherService');
const aiService = require('./aiService');
const emailService = require('./emailService');
const marked = require('marked');

/**
 * Generate and send a report for a field
 */
async function generateAndSendReport(fieldId) {
  try {
    // Get field data
    const fieldData = await getFieldData(fieldId);
    if (!fieldData) {
      throw new Error(`Field with ID ${fieldId} not found`);
    }
    
    // Get user data
    const userData = await getUserData(fieldData.farmer_name);
    if (!userData) {
      throw new Error(`User with name ${fieldData.farmer_name} not found`);
    }
    
    // Get historical weather data
    // Start from 30 days before planting date
    const plantingDate = new Date(fieldData.planting_date);
    const startDate = new Date(plantingDate);
    startDate.setDate(plantingDate.getDate() - 30);
    
    // End at current date
    const endDate = new Date();
    
    // Format dates as YYYY-MM-DD
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    // Get weather data
    const weatherData = await weatherService.getHistoricalWeather(
      fieldData.latitude,
      fieldData.longitude,
      formattedStartDate,
      formattedEndDate
    );
    
    // Get seasonal forecast
    const forecastData = await weatherService.getSeasonalForecast(
      fieldData.latitude,
      fieldData.longitude
    );
    
    // Analyze data with AI
    const aiAnalysis = await aiService.analyzeWithAI(fieldData, weatherData);
    
    // Convert markdown analysis to HTML
    const analysisHtml = marked.parse(aiAnalysis.analysis);
    
    // Prepare report data
    const reportData = {
      field: fieldData,
      user: userData,
      weather: {
        historical: weatherData,
        forecast: forecastData
      },
      analysis: analysisHtml,
      analysisSource: aiAnalysis.source,
      reportDate: new Date().toLocaleDateString(),
      appUrl: 'https://yieldera.co.zw'
    };
    
    // Send email report
    const emailResult = await emailService.sendReportEmail(
      userData.email,
      `Yieldera Field Report: ${fieldData.farm_name} - ${fieldData.crop_type}`,
      reportData
    );
    
    // Log report generation
    await logReportGeneration(fieldId, userData.id, emailResult.success);
    
    return {
      success: true,
      message: `Report generated and sent to ${userData.email}`,
      emailResult
    };
  } catch (error) {
    console.error('Error generating report:', error);
    return {
      success: false,
      message: `Failed to generate report: ${error.message}`
    };
  }
}

/**
 * Get field data from database
 */
async function getFieldData(fieldId) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM fields WHERE field_id = ?',
      [fieldId]
    );
    
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error fetching field data:', error);
    throw error;
  }
}

/**
 * Get user data from database
 */
async function getUserData(farmerName) {
  try {
    // Try to find by farmer_name matching first_name and last_name
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE CONCAT(first_name, " ", last_name) = ?',
      [farmerName]
    );
    
    if (rows.length === 0) {
      // Try to find by just first_name or last_name
      const [altRows] = await pool.query(
        'SELECT * FROM users WHERE first_name = ? OR last_name = ?',
        [farmerName, farmerName]
      );
      
      if (altRows.length === 0) {
        // If still not found, return the first admin user
        const [adminRows] = await pool.query(
          'SELECT * FROM users WHERE role = "admin" LIMIT 1'
        );
        
        return adminRows.length > 0 ? adminRows[0] : null;
      }
      
      return altRows[0];
    }
    
    return rows[0];
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

/**
 * Log report generation
 */
async function logReportGeneration(fieldId, userId, success) {
  try {
    await pool.query(
      'INSERT INTO report_logs (field_id, user_id, status, created_at) VALUES (?, ?, ?, NOW())',
      [fieldId, userId, success ? 'success' : 'failed']
    );
  } catch (error) {
    console.error('Error logging report generation:', error);
    // Don't throw error to prevent report generation failure
  }
}

module.exports = {
  generateAndSendReport
};
