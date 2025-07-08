const mysql = require('mysql2/promise');

class DatabaseService {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000
    });
  }

  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async getQueueCount() {
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM report_queue WHERE status = ?',
        ['pending']
      );
      return rows[0].count;
    } catch (error) {
      console.error('Error getting queue count:', error);
      return 0;
    }
  }

  async getPendingReports() {
    try {
      const [rows] = await this.pool.execute(`
        SELECT rq.*, f.user_id, f.farm_id, f.field_name, f.crop_type, f.variety,
               u.email, u.first_name, u.last_name, u.user_type, u.organization,
               fa.farm_name, fa.farmer_name, fa.phone_number
        FROM report_queue rq
        JOIN fields f ON rq.field_id = f.id
        JOIN users u ON f.user_id = u.id
        JOIN farms fa ON f.farm_id = fa.id
        WHERE rq.status = 'pending'
        ORDER BY rq.created_at ASC
        LIMIT 10
      `);
      return rows;
    } catch (error) {
      throw new Error(`Failed to fetch pending reports: ${error.message}`);
    }
  }

  async getFieldDetails(fieldId) {
    try {
      const [rows] = await this.pool.execute(`
        SELECT f.*, fa.farm_name, fa.farmer_name, fa.phone_number, fa.financier,
               fa.labor_availability, fa.power_source, fa.backup_power_available,
               fa.irrigation_infrastructure_available, fa.water_sources,
               fa.storage_facilities_present, fa.storage_capacity_tons,
               fa.field_fencing_status, fa.security_measures, fa.fire_guard_present,
               fa.fire_guard_condition, fa.theft_history, fa.theft_incidents_last_3_years,
               fa.drought_frequency, fa.flood_risk_level, fa.previous_season_performance,
               fa.years_in_operation, fa.climate_zone, fa.market_access_level,
               fa.distance_to_market_km, fa.credit_access_capability,
               fa.current_insurance_coverage, fa.insurance_provider,
               fa.mobile_network_coverage, fa.internet_connectivity,
               fa.annual_revenue_estimate, fa.total_operational_costs,
               fa.debt_to_income_ratio, fa.credit_score
        FROM fields f
        JOIN farms fa ON f.farm_id = fa.id
        WHERE f.id = ?
      `, [fieldId]);
      
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch field details: ${error.message}`);
    }
  }

  async getFarmFields(farmId) {
    try {
      const [rows] = await this.pool.execute(`
        SELECT id, field_name, crop_type, variety, field_size, soil_type,
               planting_date, expected_harvest_date, current_growth_stage,
               irrigation_method_enhanced, basal_fertilizer, top_dressing,
               pest_infestation_level, disease_occurrence, weed_pressure_level,
               loss_occurred_current_season, loss_percentage,
               expected_yield_per_hectare, actual_yield_per_hectare,
               previous_season_yield, latitude, longitude
        FROM fields
        WHERE farm_id = ?
        ORDER BY field_name
      `, [farmId]);
      
      return rows;
    } catch (error) {
      throw new Error(`Failed to fetch farm fields: ${error.message}`);
    }
  }

  async getUserDetails(userId) {
    try {
      const [rows] = await this.pool.execute(`
        SELECT email, first_name, last_name, user_type, organization, phone
        FROM users
        WHERE id = ?
      `, [userId]);
      
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch user details: ${error.message}`);
    }
  }

  async markReportProcessed(reportId, status = 'completed') {
    try {
      await this.pool.execute(`
        UPDATE report_queue 
        SET status = ?, processed_at = NOW()
        WHERE id = ?
      `, [status, reportId]);
    } catch (error) {
      throw new Error(`Failed to mark report as processed: ${error.message}`);
    }
  }

  async markReportError(reportId, errorMessage) {
    try {
      await this.pool.execute(`
        UPDATE report_queue 
        SET status = 'failed', error_message = ?, processed_at = NOW()
        WHERE id = ?
      `, [errorMessage, reportId]);
    } catch (error) {
      console.error('Failed to mark report error:', error);
    }
  }

  async getFarmStatistics(farmId) {
    try {
      const [stats] = await this.pool.execute(`
        SELECT 
          COUNT(*) as total_fields,
          SUM(field_size) as total_area,
          COUNT(DISTINCT crop_type) as crop_types,
          MIN(planting_date) as earliest_planting,
          MAX(planting_date) as latest_planting,
          AVG(field_size) as avg_field_size,
          COUNT(CASE WHEN basal_fertilizer = 'Yes' THEN 1 END) as fertilized_fields,
          COUNT(CASE WHEN loss_occurred_current_season = 1 THEN 1 END) as fields_with_losses,
          AVG(CASE WHEN expected_yield_per_hectare > 0 THEN expected_yield_per_hectare END) as avg_expected_yield,
          COUNT(CASE WHEN pest_infestation_level != 'None' THEN 1 END) as fields_with_pests,
          COUNT(CASE WHEN disease_occurrence = 1 THEN 1 END) as fields_with_disease
        FROM fields
        WHERE farm_id = ?
      `, [farmId]);
      
      return stats[0] || {};
    } catch (error) {
      throw new Error(`Failed to fetch farm statistics: ${error.message}`);
    }
  }

  async getCropAnalysis(farmId) {
    try {
      const [crops] = await this.pool.execute(`
        SELECT 
          crop_type,
          COUNT(*) as field_count,
          SUM(field_size) as total_area,
          AVG(field_size) as avg_field_size,
          MIN(planting_date) as earliest_planting,
          MAX(planting_date) as latest_planting,
          COUNT(DISTINCT variety) as varieties_count,
          GROUP_CONCAT(DISTINCT variety) as varieties,
          AVG(CASE WHEN expected_yield_per_hectare > 0 THEN expected_yield_per_hectare END) as avg_expected_yield,
          COUNT(CASE WHEN loss_occurred_current_season = 1 THEN 1 END) as fields_with_losses,
          COUNT(CASE WHEN pest_infestation_level != 'None' THEN 1 END) as pest_affected_fields,
          COUNT(CASE WHEN disease_occurrence = 1 THEN 1 END) as disease_affected_fields
        FROM fields
        WHERE farm_id = ? AND crop_type IS NOT NULL
        GROUP BY crop_type
        ORDER BY total_area DESC
      `, [farmId]);
      
      return crops;
    } catch (error) {
      throw new Error(`Failed to fetch crop analysis: ${error.message}`);
    }
  }
}

module.exports = DatabaseService;
