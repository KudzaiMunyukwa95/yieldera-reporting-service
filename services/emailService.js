const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
require('dotenv').config();

// Initialize email transporter with extended timeout
let transporter;

// Function to create transporter with proper configuration
function createTransporter() {
  // Default values as fallback
  const host = process.env.EMAIL_HOST || 'smtp.yieldera.co.zw';
  const port = parseInt(process.env.EMAIL_PORT || '587');
  const secure = process.env.EMAIL_SECURE === 'true';
  const user = process.env.EMAIL_USER || 'reports@yieldera.co.zw';
  const pass = process.env.EMAIL_PASSWORD;
  
  // Check if we have the required credentials
  if (!pass) {
    console.error('EMAIL_PASSWORD environment variable is not set!');
    return null;
  }
  
  // Create the transporter with extended timeout
  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: secure,
    auth: {
      user: user,
      pass: pass
    },
    // Add connection timeout settings
    connectionTimeout: 60000, // 60 seconds (default is 10 seconds)
    greetingTimeout: 30000,   // 30 seconds (default is 10 seconds)
    socketTimeout: 60000,     // 60 seconds
    debug: true,              // Enable debug output
    logger: true              // Log information to the console
  });
}

// Test email configuration with retry mechanism
async function testEmailConfig() {
  // Create the transporter if not already created
  if (!transporter) {
    transporter = createTransporter();
    if (!transporter) {
      console.error('Failed to create email transporter. Check email credentials.');
      return false;
    }
  }
  
  // Try verifying the connection with retries
  let retries = 3;
  while (retries > 0) {
    try {
      await transporter.verify();
      console.log('Email transporter is ready');
      return true;
    } catch (error) {
      console.error(`Email configuration error (${retries} retries left):`, error);
      retries--;
      
      if (retries > 0) {
        // Wait for 5 seconds before retrying
        console.log('Retrying email connection in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Recreate the transporter
        transporter = createTransporter();
      } else {
        console.error('All email connection attempts failed');
        return false;
      }
    }
  }
  
  return false;
}

// Call the test function on startup with a delay to ensure other services are ready
setTimeout(() => {
  testEmailConfig();
}, 5000);

/**
 * Send report email with optional attachments
 */
async function sendReportEmail(to, subject, reportData, attachments = []) {
  try {
    // Ensure we have a working transporter
    if (!transporter) {
      const success = await testEmailConfig();
      if (!success) {
        throw new Error('Could not configure email transport');
      }
    }
    
    // Read the email template
    const templatePath = path.join(__dirname, '../templates/report.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = Handlebars.compile(templateSource);
    
    // Generate the HTML with the report data
    const html = template(reportData);
    
    // Add the CSS as an embedded style
    const cssPath = path.join(__dirname, '../templates/report-styles.css');
    let css = '';
    try {
      css = fs.readFileSync(cssPath, 'utf8');
    } catch (cssError) {
      console.warn('Could not read CSS file, using inline styles instead:', cssError.message);
      // Fallback basic styles
      css = `
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        h1, h2, h3 { color: #5D5CDE; }
        .report-container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .section { margin-bottom: 20px; }
      `;
    }
    
    // Embed the CSS in the HTML
    const htmlWithCss = html.replace('</head>', `<style>${css}</style></head>`);
    
    // Check for yieldera logo path
    let logoPath;
    try {
      logoPath = path.join(__dirname, '../templates/yieldera-logo.png');
      fs.accessSync(logoPath, fs.constants.R_OK);
    } catch (logoError) {
      console.warn('Logo file not accessible, excluding from email:', logoError.message);
      logoPath = null;
    }
    
    // Configure email options
    const mailOptions = {
      from: `"Yieldera Reports" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlWithCss,
      attachments: [
        // Include any provided attachments
        ...attachments
      ]
    };
    
    // Add logo attachment if available
    if (logoPath) {
      mailOptions.attachments.push({
        filename: 'yieldera-logo.png',
        path: logoPath,
        cid: 'yieldera-logo' // Reference this in the HTML as <img src="cid:yieldera-logo">
      });
    }
    
    // Send the email with retry mechanism
    let retries = 2;
    let lastError;
    
    while (retries >= 0) {
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.messageId}`);
        return {
          success: true,
          messageId: info.messageId
        };
      } catch (error) {
        lastError = error;
        console.error(`Error sending email (${retries} retries left):`, error);
        
        if (retries > 0) {
          // Wait for 3 seconds before retrying
          console.log('Retrying email send in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Refresh transporter if needed
          await testEmailConfig();
        }
        
        retries--;
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('Failed to send email after multiple attempts');
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send simple text email
 */
async function sendTextEmail(to, subject, text) {
  try {
    // Ensure we have a working transporter
    if (!transporter) {
      const success = await testEmailConfig();
      if (!success) {
        throw new Error('Could not configure email transport');
      }
    }
    
    const mailOptions = {
      from: `"Yieldera Notifications" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      text: text
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`Text email sent: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('Error sending text email:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send error notification to admin
 */
async function sendErrorNotification(subject, errorDetails) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'kudzaimunyukwa@gmail.com';
    
    // Ensure we have a working transporter
    if (!transporter) {
      const success = await testEmailConfig();
      if (!success) {
        throw new Error('Could not configure email transport');
      }
    }
    
    const mailOptions = {
      from: `"Yieldera System" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `Yieldera Error: ${subject}`,
      text: `
An error occurred in the Yieldera system:

Error: ${errorDetails.message || 'Unknown error'}

Stack Trace:
${errorDetails.stack || 'No stack trace available'}

Timestamp: ${new Date().toISOString()}
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`Error notification sent: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('Error sending notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendReportEmail,
  sendTextEmail,
  sendErrorNotification,
  testEmailConfig
};
