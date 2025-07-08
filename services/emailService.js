const nodemailer = require('nodemailer');
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465,
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
      const subject = `Field Visit Report - ${reportData.farmName}`;
      
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
    <title>Yieldera Field Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 650px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .email-container {
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(1, 46, 55, 0.15);
        }
        .header {
            background: linear-gradient(135deg, #012E37 0%, #B6BF00 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 1.8em;
            font-weight: 600;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.95;
            font-size: 1em;
        }
        .greeting {
            padding: 25px 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .greeting h2 {
            color: #012E37;
            margin: 0 0 10px 0;
            font-size: 1.3em;
        }
        .greeting p {
            margin: 0;
            color: #666;
            font-size: 0.95em;
        }
        .section {
            padding: 25px 30px;
            border-bottom: 1px solid #f0f0f0;
        }
        .section:last-child {
            border-bottom: none;
        }
        .section h3 {
            color: #012E37;
            margin: 0 0 15px 0;
            font-size: 1.2em;
        }
        .field-summary {
            background: linear-gradient(135deg, rgba(182, 191, 0, 0.1) 0%, rgba(1, 46, 55, 0.05) 100%);
            border-left: 4px solid #B6BF00;
            padding: 20px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        .field-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            margin: 15px 0;
        }
        .detail-item {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }
        .detail-label {
            font-size: 0.8em;
            color: #666;
            margin-bottom: 4px;
            font-weight: 500;
        }
        .detail-value {
            font-weight: 600;
            color: #012E37;
            font-size: 0.95em;
        }
        .weather-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .weather-table th,
        .weather-table td {
            padding: 10px;
            text-align: center;
            border-bottom: 1px solid #e9ecef;
        }
        .weather-table th {
            background: #012E37;
            color: #B6BF00;
            font-weight: 600;
            font-size: 0.9em;
        }
        .weather-table td {
            font-size: 0.85em;
        }
        .weather-table tr:last-child td {
            border-bottom: none;
        }
        .weather-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        .crop-section {
            background: rgba(182, 191, 0, 0.1);
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .crop-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .crop-name {
            font-size: 1.2em;
            font-weight: bold;
            color: #012E37;
        }
        .crop-badge {
            background: #B6BF00;
            color: white;
            padding: 6px 12px;
            border-radius: 15px;
            font-size: 0.8em;
            font-weight: 600;
        }
        .analysis-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #B6BF00;
            margin: 15px 0;
            font-size: 0.95em;
            line-height: 1.7;
        }
        .analysis-section h4 {
            color: #012E37;
            margin: 0 0 15px 0;
            font-size: 1.1em;
        }
        .recommendations {
            background: rgba(182, 191, 0, 0.05);
            border: 1px solid rgba(182, 191, 0, 0.3);
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        .recommendation-item {
            margin: 10px 0;
            padding: 12px;
            background: white;
            border-left: 4px solid #B6BF00;
            border-radius: 0 4px 4px 0;
            font-size: 0.95em;
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
        .alert-info {
            background: rgba(1, 46, 55, 0.1);
            border-color: #012E37;
            color: #012E37;
        }
        .signature {
            background: #f8f9fa;
            padding: 25px 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        .signature h4 {
            color: #012E37;
            margin: 0 0 10px 0;
            font-size: 1.1em;
        }
        .signature p {
            margin: 5px 0;
            color: #666;
            font-size: 0.9em;
        }
        .footer {
            background: #012E37;
            color: #B6BF00;
            text-align: center;
            padding: 20px;
        }
        .footer p {
            margin: 5px 0;
            opacity: 1;
            color: #B6BF00;
        }
        .logo-text {
            font-weight: bold;
            color: #B6BF00;
        }
        @media (max-width: 600px) {
            body { padding: 10px; }
            .section, .greeting { padding: 20px 15px; }
            .field-details, .weather-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <h1>Yieldera Field Report</h1>
            <p>{{reportType}} | {{farmName}} | {{generatedDate}}</p>
        </div>

        <!-- Personal Greeting -->
        <div class="greeting">
            <h2>Hello {{recipientName}},</h2>
            <p>We've completed a field assessment for <strong>{{triggerField.field_name}}</strong> at {{farmName}}. Here's your comprehensive analysis.</p>
        </div>

        <!-- Executive Summary -->
        <div class="section">
            <h3>📋 Field Overview</h3>
            <div class="field-summary">
                <p><strong>Farm:</strong> {{farmName}} ({{farmerName}})</p>
                <p><strong>Assessment Date:</strong> {{assessmentDate}}</p>
                <p><strong>Assessment Reason:</strong> {{assessmentTrigger}}</p>
            </div>
        </div>

        <!-- Field Conditions at Time of Visit -->
        {{#if weather}}
        <div class="section">
            <h3>🌤️ Weather Analysis</h3>
            
            {{#if weather.historical}}
            <h4 style="color: #012E37; margin: 20px 0 10px 0;">Past 7 Days Weather</h4>
            <table class="weather-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Max Temp (°C)</th>
                        <th>Min Temp (°C)</th>
                        <th>Rainfall (mm)</th>
                        <th>Conditions</th>
                    </tr>
                </thead>
                <tbody>
                    {{#each weather.historical}}
                    <tr>
                        <td>{{date}}</td>
                        <td>{{tempMax}}</td>
                        <td>{{tempMin}}</td>
                        <td>{{precipitation}}</td>
                        <td>{{description}}</td>
                    </tr>
                    {{/each}}
                </tbody>
            </table>
            {{/if}}

            {{#if weather.current.forecast}}
            <h4 style="color: #012E37; margin: 20px 0 10px 0;">Next 7 Days Forecast</h4>
            <table class="weather-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Max Temp (°C)</th>
                        <th>Min Temp (°C)</th>
                        <th>Rainfall (mm)</th>
                        <th>Wind (km/h)</th>
                        <th>Conditions</th>
                    </tr>
                </thead>
                <tbody>
                    {{#each weather.current.forecast}}
                    <tr>
                        <td>{{date}}</td>
                        <td>{{tempMax}}</td>
                        <td>{{tempMin}}</td>
                        <td>{{precipitation}}</td>
                        <td>{{windSpeed}}</td>
                        <td>{{description}}</td>
                    </tr>
                    {{/each}}
                </tbody>
            </table>
            {{/if}}

            {{#if weather.agronomicInsights.insights}}
            {{#each weather.agronomicInsights.insights}}
            <div class="alert alert-info">
                <strong>{{category}}:</strong> {{message}}
            </div>
            {{/each}}
            {{/if}}
        </div>
        {{/if}}

        <!-- Farm Crops Summary -->
        {{#if cropAnalysis}}
        <div class="section">
            <h3>🌱 Farm Crops</h3>
            {{#each cropAnalysis}}
            <div class="crop-section">
                <div class="crop-header">
                    <div class="crop-name">{{crop_type}}</div>
                    <div class="crop-badge">{{field_count}} Fields • {{total_area}} ha</div>
                </div>
                <div class="field-details">
                    <div class="detail-item">
                        <div class="detail-label">Varieties</div>
                        <div class="detail-value">{{varieties}}</div>
                    </div>
                    {{#if earliest_planting}}
                    <div class="detail-item">
                        <div class="detail-label">Planting Dates</div>
                        <div class="detail-value">{{earliest_planting}} to {{latest_planting}}</div>
                    </div>
                    {{/if}}
                </div>
                {{#if fields_with_losses}}
                <div class="alert alert-warning">
                    <strong>⚠️ Risk Alert:</strong> {{fields_with_losses}} of {{field_count}} fields have losses.
                </div>
                {{/if}}
            </div>
            {{/each}}
        </div>
        {{/if}}

        <!-- Specific Field Analysis -->
        <div class="section">
            <h3>🎯 {{triggerField.field_name}} Analysis</h3>
            
            <div class="field-details">
                <div class="detail-item">
                    <div class="detail-label">Crop & Variety</div>
                    <div class="detail-value">{{triggerField.crop_type}}{{#if triggerField.variety}} ({{triggerField.variety}}){{/if}}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Field Size</div>
                    <div class="detail-value">{{triggerField.field_size}} hectares</div>
                </div>
                {{#if triggerField.latitude}}
                <div class="detail-item">
                    <div class="detail-label">GPS Coordinates</div>
                    <div class="detail-value">{{triggerField.latitude}}, {{triggerField.longitude}}</div>
                </div>
                {{/if}}
                {{#if triggerField.accuracy}}
                <div class="detail-item">
                    <div class="detail-label">GPS Accuracy</div>
                    <div class="detail-value">{{triggerField.accuracy}}m</div>
                </div>
                {{/if}}
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
                {{else}}
                <div class="detail-item">
                    <div class="detail-label">Growth Stage</div>
                    <div class="detail-value" style="color: #856404;">Not captured during visit</div>
                </div>
                {{/if}}
                <div class="detail-item">
                    <div class="detail-label">Irrigation</div>
                    <div class="detail-value">{{triggerField.irrigation_method_enhanced}}</div>
                </div>
            </div>

            {{#if aiAnalysis}}
            <div class="analysis-section">
                <h4>Yieldera Field Analysis</h4>
                {{{aiAnalysis}}}
            </div>
            {{/if}}
        </div>

        <!-- Weather Recommendations -->
        {{#if weather.agronomicInsights.recommendations}}
        <div class="section">
            <h3>💡 Weather-Based Recommendations</h3>
            <div class="recommendations">
                {{#each weather.agronomicInsights.recommendations}}
                <div class="recommendation-item">{{this}}</div>
                {{/each}}
            </div>
        </div>
        {{/if}}

        <!-- Strategic Recommendations -->
        {{#if aiRecommendations}}
        <div class="section">
            <h3>🎯 Strategic Recommendations</h3>
            <div class="analysis-section">
                <h4>Yieldera Field Recommendations</h4>
                {{{aiRecommendations}}}
            </div>
        </div>
        {{/if}}

        <!-- Signature -->
        <div class="signature">
            <h4>Report by Yieldera Agricultural Intelligence</h4>
            <p>Combining field observations, weather data, and agricultural intelligence for all stakeholders.</p>
            <p><em>Generated {{generatedDate}} | Report {{reportId}}</em></p>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p><span class="logo-text">Yieldera</span> - Empowering Agriculture Through Data</p>
            <p style="font-size: 0.8em;">Support: reports@yieldera.co.zw</p>
        </div>
    </div>
</body>
</html>`;

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
