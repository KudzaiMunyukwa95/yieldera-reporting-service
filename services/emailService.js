const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
require('dotenv').config();

// Initialize email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Test email configuration
async function testEmailConfig() {
  try {
    await transporter.verify();
    console.log('Email transporter is ready');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
}

// Call the test function on startup
testEmailConfig();

/**
 * Send report email with optional attachments
 */
async function sendReportEmail(to, subject, reportData, attachments = []) {
  try {
    // Read the email template
    const templatePath = path.join(__dirname, '../templates/report.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = Handlebars.compile(templateSource);
    
    // Generate the HTML with the report data
    const html = template(reportData);
    
    // Add the CSS as an embedded style
    const cssPath = path.join(__dirname, '../templates/report-styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Embed the CSS in the HTML
    const htmlWithCss = html.replace('</head>', `<style>${css}</style></head>`);
    
    // Configure email options
    const mailOptions = {
      from: `"Yieldera Reports" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlWithCss,
      attachments: [
        // Include any provided attachments
        ...attachments,
        // Optional: Attach the Yieldera logo
        {
          filename: 'yieldera-logo.png',
          path: path.join(__dirname, '../templates/yieldera-logo.png'),
          cid: 'yieldera-logo' // Reference this in the HTML as <img src="cid:yieldera-logo">
        }
      ]
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`Email sent: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId
    };
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
