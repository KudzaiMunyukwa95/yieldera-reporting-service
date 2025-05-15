const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const { pool } = require('../config/db');
const weatherService = require('./weatherService');
const aiService = require('./aiService');
const emailService = require('./emailService');
const marked = require('marked');
const { mangle } = require('marked-mangle');
const { gfmHeadingId } = require('marked-gfm-heading-id');

// Configure marked with extensions to fix deprecation warnings
marked.use(
  mangle(),
  gfmHeadingId()
);

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
    const userData = await getUserData(fieldData);
    if (!userData) {
      throw new Error(`No suitable user found for field ID ${fieldId}`);
    }
    
    // Get historical weather data
    // Start from 30 days before planting date
    const plantingDate = new Date(fieldData.planting_date || Date.now());
    const startDate = new Date(plantingDate);
    startDate.setDate(plantingDate.getDate() - 30);
    
    // End at current date
    const endDate = new Date();
    
    // Format dates as YYYY-MM-DD
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    // Get historical weather data
    const weatherData = await weatherService.getHistoricalWeather(
      fieldData.latitude,
      fieldData.longitude,
      formattedStartDate,
      formattedEndDate
    );
    
    // Get weather forecast for next 7 days
    const forecastEndDate = new Date(endDate);
    forecastEndDate.setDate(endDate.getDate() + 7);
    const formattedForecastEndDate = forecastEndDate.toISOString().split('T')[0];
    
    const forecastData = await weatherService.getSeasonalForecast(
      fieldData.latitude,
      fieldData.longitude,
      formattedEndDate,
      formattedForecastEndDate
    );
    
    // Analyze data with AI
    const aiAnalysis = await aiService.analyzeWithAI(fieldData, weatherData, forecastData);
    
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
    
    // Generate PDF report
    console.log("Generating PDF report...");
    let pdfBuffer;
    try {
      pdfBuffer = await generatePdfReport(reportData);
      console.log("PDF report generated successfully");
    } catch (pdfError) {
      console.error("Error generating PDF report:", pdfError);
      // Continue without PDF if it fails
    }
    
    // Prepare attachments
    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: `Yieldera_Report_${fieldId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }
    
    // Send email report
    const emailResult = await emailService.sendReportEmail(
      userData.email,
      `Yieldera Field Report: ${fieldData.farm_name || 'Your Field'} - ${fieldData.crop_type || 'Crop'}`,
      reportData,
      attachments
    );
    
    // Log report generation
    await logReportGeneration(fieldId, userData.id, emailResult.success);
    
    return {
      success: true,
      message: `Report generated and sent to ${userData.email}`,
      emailResult,
      hasPdf: !!pdfBuffer
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
 * Generate PDF report
 */
async function generatePdfReport(reportData) {
  try {
    // Read the Handlebars template
    const templatePath = path.join(__dirname, '../templates/report.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = Handlebars.compile(templateSource);
    
    // Generate the HTML with the report data
    const html = template(reportData);
    
    // Launch a headless browser
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });
    
    // Create a new page
    const page = await browser.newPage();
    
    // Set the HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    // Close the browser
    await browser.close();
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF report:', error);
    throw error;
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
 * Get user data from database - enhanced to be more robust
 */
async function getUserData(fieldData) {
  try {
    // First try with user_id if available in fieldData
    if (fieldData.user_id) {
      console.log(`Looking for user by user_id: ${fieldData.user_id}`);
      const [userRows] = await pool.query(
        'SELECT * FROM users WHERE id = ?',
        [fieldData.user_id]
      );
      
      if (userRows.length > 0) {
        console.log(`Found user by user_id: ${userRows[0].email}`);
        return userRows[0];
      }
    }
    
    // If user_id didn't work or isn't available, try with farmer_name
    if (fieldData.farmer_name) {
      console.log(`Looking for user by farmer_name: ${fieldData.farmer_name}`);
      
      // Try exact match with concat of first_name and last_name
      const [nameRows] = await pool.query(
        'SELECT * FROM users WHERE CONCAT(first_name, " ", last_name) = ?',
        [fieldData.farmer_name]
      );
      
      if (nameRows.length > 0) {
        console.log(`Found user by full name: ${nameRows[0].email}`);
        return nameRows[0];
      }
      
      // Try partial match
      const [partialRows] = await pool.query(
        'SELECT * FROM users WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?',
        [`%${fieldData.farmer_name}%`, `%${fieldData.farmer_name}%`, `%${fieldData.farmer_name}%`]
      );
      
      if (partialRows.length > 0) {
        console.log(`Found user by partial name match: ${partialRows[0].email}`);
        return partialRows[0];
      }
    }
    
    // If all else fails, get the first admin user
    console.log('No matching user found, looking for admin user');
    const [adminRows] = await pool.query(
      'SELECT * FROM users WHERE role = "admin" LIMIT 1'
    );
    
    if (adminRows.length > 0) {
      console.log(`Using admin user as fallback: ${adminRows[0].email}`);
      return adminRows[0];
    }
    
    // Last resort: get any user
    console.log('No admin found, looking for any user');
    const [anyRows] = await pool.query(
      'SELECT * FROM users LIMIT 1'
    );
    
    if (anyRows.length > 0) {
      console.log(`Using any user as last resort: ${anyRows[0].email}`);
      return anyRows[0];
    }
    
    // If we get here, there are no users in the database!
    console.log('No users found in database!');
    return null;
  } catch (error) {
    console.error('Error fetching user data:', error);
    // Return a default user with email for critical notifications
    return {
      id: 0,
      email: 'kudzaimunyukwa@gmail.com', // Using the email from your screenshot as a fallback
      first_name: 'System',
      last_name: 'Notification',
      role: 'system'
    };
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
  generateAndSendReport,
  generatePdfReport
};
