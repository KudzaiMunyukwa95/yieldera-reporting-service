const reportService = require('../services/reportService');

/**
 * Handle new field creation webhook
 */
async function handleNewField(req, res) {
  try {
    const { field_id } = req.body;
    
    if (!field_id) {
      return res.status(400).json({
        success: false,
        message: 'Field ID is required'
      });
    }
    
    // Queue report generation (async)
    generateReportInBackground(field_id);
    
    return res.status(200).json({
      success: true,
      message: 'Report generation queued'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Generate report in background
 */
async function generateReportInBackground(fieldId) {
  try {
    console.log(`Generating report for field ID: ${fieldId}`);
    const result = await reportService.generateAndSendReport(fieldId);
    console.log('Report generation result:', result);
  } catch (error) {
    console.error('Background report generation error:', error);
  }
}

module.exports = {
  handleNewField
};
