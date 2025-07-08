const nodemailer = require('nodemailer');
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      throw new Error(`Email service connection failed: ${error.message}`);
    }
  }

  async sendReport(recipientEmail, recipientName, reportData) {
    try {
      const subject = `${reportData.reportType} - ${reportData.farmName} | Yieldera Agricultural Report`;
      
      const htmlContent = this.generateReportHTML(reportData);
      
      const mailOptions = {
        from: `"Yieldera Reports" <${process.env.EMAIL_FROM}>`,
        to: recipientEmail,
        subject: subject,
        html: htmlContent,
        attachments: []
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Report sent to ${recipientEmail} (Message ID: ${result.messageId})`);
      
      return result;
    } catch (error) {
      console.error(`❌ Failed to send report to ${recipientEmail}:`, error);
      throw error;
    }
  }

  generateReportHTML(data) {
    const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yieldera Agricultural Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #2E8B57 0%, #228B22 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.2em;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .content {
            background: white;
            padding: 0;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .section {
            padding: 25px 30px;
            border-bottom: 1px solid #eee;
        }
        .section:last-child {
            border-bottom: none;
        }
        .section h2 {
            color: #2E8B57;
            margin-top: 0;
            border-bottom: 2px solid #e8f5e8;
            padding-bottom: 10px;
            font-size: 1.4em;
        }
        .farm-overview {
            background: #f8fffe;
            border-left: 4px solid #2E8B57;
            padding: 20px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e0e0e0;
        }
        .stat-number {
            font-size: 1.8em;
            font-weight: bold;
            color: #2E8B57;
            display: block;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .field-card {
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        .field-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .field-name {
            font-size: 1.2em;
            font-weight: bold;
            color: #2E8B57;
        }
        .crop-badge {
            background: #228B22;
            color: white;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .field-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }
        .detail-item {
            padding: 8px;
            background: white;
            border-radius: 4px;
            border: 1px solid #eee;
        }
        .detail-label {
            font-size: 0.8em;
            color: #666;
            margin-bottom: 2px;
        }
        .detail-value {
            font-weight: bold;
            color: #333;
        }
        .weather-section {
            background: linear-gradient(135deg, #87CEEB 0%, #4682B4 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .weather-current {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        .weather-item {
            text-align: center;
            background: rgba(255,255,255,0.1);
            padding: 10px;
            border-radius: 6px;
        }
        .recommendations {
            background: #fffbf0;
            border: 1px solid #ffd700;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        .recommendation-item {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-left: 4px solid #ffd700;
            border-radius: 0 4px 4px 0;
        }
        .alert {
            padding: 15px;
            margin: 15px 0;
            border-radius: 8px;
            border-left: 4px solid;
        }
        .alert-warning {
            background: #fff3cd;
            border-color: #ffc107;
            color: #856404;
        }
        .alert-success {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }
        .alert-info {
            background: #d1ecf1;
            border-color: #17a2b8;
            color: #0c5460;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            background: #f8f9fa;
            border-radius: 0 0 10px 10px;
            margin-top: 0;
        }
        .signature {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 30px;
            color: #666;
            font-size: 0.9em;
        }
        @media (max-width: 600px) {
            body { padding: 10px; }
            .header, .section { padding: 20px 15px; }
            .stats-grid { grid-template-columns: 1fr; }
            .field-header { flex-direction: column; align-items: flex-start; }
            .field-details { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌾 Yieldera Agricultural Report</h1>
        <p>{{reportType}} | {{farmName}} | {{generatedDate}}</p>
    </div>

    <div class="content">
        <!-- Executive Summary -->
        <div class="section">
            <h2>📋 Executive Summary</h2>
            <div class="farm-overview">
                <p><strong>Farm:</strong> {{farmName}} ({{farmerName}})</p>
                <p><strong>Assessment Date:</strong> {{assessmentDate}}</p>
                <p><strong>Total Fields:</strong> {{totalFields}} | <strong>Total Area:</strong> {{totalArea}} hectares</p>
                <p><strong>Primary Crops:</strong> {{primaryCrops}}</p>
                {{#if assessmentTrigger}}
                <p><strong>Assessment Triggered By:</strong> {{assessmentTrigger}}</p>
                {{/if}}
            </div>
        </div>

        <!-- Farm Statistics -->
        <div class="section">
            <h2>📊 Farm Overview Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.total_fields}}</span>
                    <div class="stat-label">Total Fields</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.total_area}}</span>
                    <div class="stat-label">Total Area (ha)</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.crop_types}}</span>
                    <div class="stat-label">Crop Types</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.fertilized_fields}}</span>
                    <div class="stat-label">Fertilized Fields</div>
                </div>
                {{#if farmStats.avg_expected_yield}}
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.avg_expected_yield}}</span>
                    <div class="stat-label">Avg Expected Yield (t/ha)</div>
                </div>
                {{/if}}
                {{#if farmStats.fields_with_losses}}
                <div class="stat-card">
                    <span class="stat-number">{{farmStats.fields_with_losses}}</span>
                    <div class="stat-label">Fields with Losses</div>
                </div>
                {{/if}}
            </div>
        </div>

        <!-- Weather Analysis -->
        {{#if weather}}
        <div class="section">
            <h2>🌤️ Weather Analysis & Impact</h2>
            <div class="weather-section">
                <h3 style="margin-top: 0; color: white;">Current Conditions</h3>
                <div class="weather-current">
                    {{#if weather.current.current.temperature}}
                    <div class="weather-item">
                        <div style="font-size: 1.2em; font-weight: bold;">{{weather.current.current.temperature}}°C</div>
                        <div style="font-size: 0.8em;">Temperature</div>
                    </div>
                    {{/if}}
                    {{#if weather.current.current.humidity}}
                    <div class="weather-item">
                        <div style="font-size: 1.2em; font-weight: bold;">{{weather.current.current.humidity}}%</div>
                        <div style="font-size: 0.8em;">Humidity</div>
                    </div>
                    {{/if}}
                    {{#if weather.analysis.last7Days.totalRainfall}}
                    <div class="weather-item">
                        <div style="font-size: 1.2em; font-weight: bold;">{{weather.analysis.last7Days.totalRainfall}}mm</div>
                        <div style="font-size: 0.8em;">7-Day Rainfall</div>
                    </div>
                    {{/if}}
                    {{#if weather.analysis.last7Days.lowestTemp}}
                    <div class="weather-item">
                        <div style="font-size: 1.2em; font-weight: bold;">{{weather.analysis.last7Days.lowestTemp}}°C</div>
                        <div style="font-size: 0.8em;">7-Day Low</div>
                    </div>
                    {{/if}}
                    {{#if weather.analysis.last7Days.highestTemp}}
                    <div class="weather-item">
                        <div style="font-size: 1.2em; font-weight: bold;">{{weather.analysis.last7Days.highestTemp}}°C</div>
                        <div style="font-size: 0.8em;">7-Day High</div>
                    </div>
                    {{/if}}
                </div>
            </div>

            {{#if weather.agronomicInsights.insights}}
            {{#each weather.agronomicInsights.insights}}
            <div class="alert alert-{{#if (eq type 'warning')}}warning{{else if (eq type 'positive')}}success{{else}}info{{/if}}">
                <strong>{{category}}:</strong> {{message}}
            </div>
            {{/each}}
            {{/if}}
        </div>
        {{/if}}

        <!-- Crop Analysis -->
        {{#if cropAnalysis}}
        <div class="section">
            <h2>🌱 Crop-Specific Analysis</h2>
            {{#each cropAnalysis}}
            <div class="field-card">
                <div class="field-header">
                    <div class="field-name">{{crop_type}}</div>
                    <div class="crop-badge">{{field_count}} Fields</div>
                </div>
                <div class="field-details">
                    <div class="detail-item">
                        <div class="detail-label">Total Area</div>
                        <div class="detail-value">{{total_area}} ha</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Varieties</div>
                        <div class="detail-value">{{varieties}}</div>
                    </div>
                    {{#if earliest_planting}}
                    <div class="detail-item">
                        <div class="detail-label">Planting Range</div>
                        <div class="detail-value">{{earliest_planting}} to {{latest_planting}}</div>
                    </div>
                    {{/if}}
                    {{#if avg_expected_yield}}
                    <div class="detail-item">
                        <div class="detail-label">Expected Yield</div>
                        <div class="detail-value">{{avg_expected_yield}} t/ha</div>
                    </div>
                    {{/if}}
                </div>
                {{#if (or fields_with_losses pest_affected_fields disease_affected_fields)}}
                <div style="margin-top: 15px;">
                    {{#if fields_with_losses}}
                    <div class="alert alert-warning">
                        <strong>⚠️ Risk Alert:</strong> {{fields_with_losses}} of {{field_count}} fields have reported losses this season.
                    </div>
                    {{/if}}
                    {{#if pest_affected_fields}}
                    <div class="alert alert-warning">
                        <strong>🐛 Pest Alert:</strong> {{pest_affected_fields}} fields showing pest infestation.
                    </div>
                    {{/if}}
                    {{#if disease_affected_fields}}
                    <div class="alert alert-warning">
                        <strong>🦠 Disease Alert:</strong> {{disease_affected_fields}} fields showing disease symptoms.
                    </div>
                    {{/if}}
                </div>
                {{/if}}
            </div>
            {{/each}}
        </div>
        {{/if}}

        <!-- Field Details -->
        {{#if triggerField}}
        <div class="section">
            <h2>🎯 Field Assessment: {{triggerField.field_name}}</h2>
            <div class="field-card">
                <div class="field-header">
                    <div class="field-name">{{triggerField.field_name}}</div>
                    <div class="crop-badge">{{triggerField.crop_type}} {{#if triggerField.variety}}({{triggerField.variety}}){{/if}}</div>
                </div>
                
                <div class="field-details">
                    <div class="detail-item">
                        <div class="detail-label">Field Size</div>
                        <div class="detail-value">{{triggerField.field_size}} hectares</div>
                    </div>
                    {{#if triggerField.soil_type}}
                    <div class="detail-item">
                        <div class="detail-label">Soil Type</div>
                        <div class="detail-value">{{triggerField.soil_type}}</div>
                    </div>
                    {{/if}}
                    {{#if triggerField.planting_date}}
                    <div class="detail-item">
                        <div class="detail-label">Planting Date</div>
                        <div class="detail-value">{{triggerField.planting_date}}</div>
                    </div>
                    {{/if}}
                    {{#if triggerField.current_growth_stage}}
                    <div class="detail-item">
                        <div class="detail-label">Growth Stage</div>
                        <div class="detail-value">{{triggerField.current_growth_stage}}</div>
                    </div>
                    {{/if}}
                    <div class="detail-item">
                        <div class="detail-label">Irrigation</div>
                        <div class="detail-value">{{triggerField.irrigation_method_enhanced}}</div>
                    </div>
                    {{#if triggerField.basal_fertilizer}}
                    <div class="detail-item">
                        <div class="detail-label">Basal Fertilizer</div>
                        <div class="detail-value">{{triggerField.basal_fertilizer}} {{#if triggerField.basal_fertilizer_type}}({{triggerField.basal_fertilizer_type}}){{/if}}</div>
                    </div>
                    {{/if}}
                </div>

                {{#if aiAnalysis}}
                <div style="margin-top: 20px;">
                    <h4 style="color: #2E8B57; margin-bottom: 15px;">🤖 AI Agronomic Analysis</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #2E8B57;">
                        {{{aiAnalysis}}}
                    </div>
                </div>
                {{/if}}
            </div>
        </div>
        {{/if}}

        <!-- Recommendations -->
        {{#if (or weather.agronomicInsights.recommendations aiRecommendations)}}
        <div class="section">
            <h2>💡 Recommendations & Action Items</h2>
            <div class="recommendations">
                {{#if weather.agronomicInsights.recommendations}}
                <h4 style="color: #f39c12; margin-bottom: 15px;">🌤️ Weather-Based Recommendations</h4>
                {{#each weather.agronomicInsights.recommendations}}
                <div class="recommendation-item">{{this}}</div>
                {{/each}}
                {{/if}}

                {{#if aiRecommendations}}
                <h4 style="color: #f39c12; margin-bottom: 15px; margin-top: 25px;">🤖 AI-Generated Recommendations</h4>
                <div style="background: white; padding: 15px; border-radius: 6px;">
                    {{{aiRecommendations}}}
                </div>
                {{/if}}
            </div>
        </div>
        {{/if}}

        <!-- Farm Infrastructure Overview -->
        {{#if farmDetails}}
        <div class="section">
            <h2>🏗️ Farm Infrastructure & Risk Assessment</h2>
            <div class="field-details">
                {{#if farmDetails.power_source}}
                <div class="detail-item">
                    <div class="detail-label">Power Source</div>
                    <div class="detail-value">{{farmDetails.power_source}} {{#if farmDetails.backup_power_available}}+ Backup{{/if}}</div>
                </div>
                {{/if}}
                {{#if farmDetails.water_sources}}
                <div class="detail-item">
                    <div class="detail-label">Water Sources</div>
                    <div class="detail-value">{{farmDetails.water_sources}}</div>
                </div>
                {{/if}}
                {{#if farmDetails.irrigation_infrastructure_available}}
                <div class="detail-item">
                    <div class="detail-label">Irrigation Infrastructure</div>
                    <div class="detail-value">{{#if (eq farmDetails.irrigation_infrastructure_available 1)}}Available{{else}}Not Available{{/if}}</div>
                </div>
                {{/if}}
                {{#if farmDetails.security_measures}}
                <div class="detail-item">
                    <div class="detail-label">Security</div>
                    <div class="detail-value">{{farmDetails.security_measures}}</div>
                </div>
                {{/if}}
                {{#if farmDetails.drought_frequency}}
                <div class="detail-item">
                    <div class="detail-label">Drought Risk</div>
                    <div class="detail-value">{{farmDetails.drought_frequency}}</div>
                </div>
                {{/if}}
                {{#if farmDetails.flood_risk_level}}
                <div class="detail-item">
                    <div class="detail-label">Flood Risk</div>
                    <div class="detail-value">{{farmDetails.flood_risk_level}}</div>
                </div>
                {{/if}}
            </div>
        </div>
        {{/if}}

        <!-- Report Footer -->
        <div class="signature">
            <p><strong>Report generated by Yieldera Agricultural Intelligence Platform</strong></p>
            <p>This report combines field data, weather analysis, and AI-powered insights to provide comprehensive agricultural intelligence for {{userType}} stakeholders.</p>
            <p><em>Generated on {{generatedDate}} | Report ID: {{reportId}}</em></p>
        </div>
    </div>

    <div class="footer">
        <p>🌾 <strong>Yieldera</strong> - Empowering Agriculture Through Data Intelligence</p>
        <p style="font-size: 0.8em; color: #999;">This is an automated report. For support, contact: reports@yieldera.co.zw</p>
    </div>
</body>
</html>`;

    // Register Handlebars helper for equality comparison
    handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    const compiledTemplate = handlebars.compile(template);
    return compiledTemplate(data);
  }

  formatUserType(userType) {
    const types = {
      'farmer': 'Farmer',
      'insurer': 'Insurance Company',
      'contractor': 'Agricultural Contractor',
      'bank': 'Financial Institution',
      'ngo': 'NGO',
      'microfinance': 'Microfinance Institution',
      'ministry': 'Government Ministry',
      'seed_company': 'Seed Company',
      'input_supplier': 'Input Supplier',
      'research_institution': 'Research Institution',
      'university': 'University',
      'cooperative': 'Cooperative',
      'donor': 'Donor Organization',
      'irrigation_scheme': 'Irrigation Scheme',
      'municipality': 'Municipality',
      'agtech_partner': 'AgTech Partner'
    };
    
    return types[userType] || userType;
  }
}

module.exports = EmailService;
