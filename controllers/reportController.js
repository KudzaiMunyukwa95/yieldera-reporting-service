const { pool } = require('../config/db');
const reportService = require('../services/reportService');

/**
 * Generate report for a specific field
 */
async function generateReport(req, res) {
  try {
    const { field_id } = req.params;
    
    if (!field_id) {
      return res.status(400).json({
        success: false,
        message: 'Field ID is required'
      });
    }
    
    const result = await reportService.generateAndSendReport(field_id);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Report generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

/**
 * Generate reports for all fields
 */
async function generateAllReports(req, res) {
  try {
    // Get all fields
    const [fields] = await pool.query('SELECT id FROM fields');
    
    // Queue report generation for each field
    const promises = fields.map(field => 
      reportService.generateAndSendReport(field.id)
    );
    
    // Wait for all reports to be generated
    const results = await Promise.allSettled(promises);
    
    // Count successes and failures
    const successes = results.filter(result => result.status === 'fulfilled' && result.value.success).length;
    const failures = results.length - successes;
    
    return res.status(200).json({
      success: true,
      message: `Generated ${successes} reports, ${failures} failures out of ${results.length} total fields`
    });
  } catch (error) {
    console.error('Bulk report generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = {
  generateReport,
  generateAllReports
};
