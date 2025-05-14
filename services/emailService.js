const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
require('dotenv').config();

// Create mail transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify transporter
async function verifyTransporter() {
  try {
    await transporter.verify();
    console.log('Email transporter is ready');
    return true;
  } catch (error) {
    console.error('Email transporter verification failed:', error);
    return false;
  }
}

// Load email template
const emailTemplatePath = path.join(__dirname, '../templates/report.hbs');
const emailTemplate = fs.readFileSync(emailTemplatePath, 'utf-8');
const compiledTemplate = handlebars.compile(emailTemplate);

/**
 * Send email with field report
 */
async function sendReportEmail(to, subject, reportData) {
  try {
    // Prepare HTML content from template
    const html = compiledTemplate(reportData);
    
    // Send email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });
    
    console.log('Email sent:', info.messageId);
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

module.exports = {
  verifyTransporter,
  sendReportEmail
};
