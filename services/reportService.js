const OpenAI = require('openai');
const moment = require('moment');

class ReportService {
  constructor(dbService, emailService, weatherService) {
    this.db = dbService;
    this.email = emailService;
    this.weather = weatherService;
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async processPendingReports() {
    try {
      const pendingReports = await this.db.getPendingReports();
      
      if (pendingReports.length === 0) {
        return { processed: 0, errors: 0 };
      }

      console.log(`📋 Found ${pendingReports.length} pending reports to process`);
      
      let processed = 0;
      let errors = 0;

      for (const report of pendingReports) {
        try {
          await this.processIndividualReport(report);
          await this.db.markReportProcessed(report.id);
          processed++;
          
          console.log(`✅ Processed report ${report.id} for field ${report.field_name}`);
          
          // Small delay to avoid overwhelming the APIs
          await this.delay(1000);
          
        } catch (error) {
          console.error(`❌ Error processing report ${report.id}:`, error.message);
          await this.db.markReportError(report.id, error.message);
          errors++;
        }
      }

      return { processed, errors };
    } catch (error) {
      console.error('❌ Error in processPendingReports:', error);
      throw error;
    }
  }

  async processIndividualReport(report) {
    try {
      console.log(`🔄 Processing report for ${report.field_name} (${report.crop_type})`);
      
      // Gather all necessary data
      const [fieldDetails, farmFields, farmStats, cropAnalysis, weatherData] = await Promise.all([
        this.db.getFieldDetails(report.field_id),
        this.db.getFarmFields(report.farm_id),
        this.db.getFarmStatistics(report.farm_id),
        this.db.getCropAnalysis(report.farm_id),
        this.getWeatherDataForField(report.field_id)
      ]);

      // Generate AI analysis
      const aiAnalysis = await this.generateAIAnalysis(fieldDetails, weatherData, report.trigger_type);
      const aiRecommendations = await this.generateAIRecommendations(fieldDetails, farmFields, weatherData, cropAnalysis);

      // Prepare report data
      const reportData = this.prepareReportData({
        report,
        fieldDetails,
        farmFields,
        farmStats,
        cropAnalysis,
        weatherData,
        aiAnalysis,
        aiRecommendations
      });

      // Send email
      await this.email.sendReport(
        report.email,
        `${report.first_name} ${report.last_name}`,
        reportData
      );

      return reportData;
    } catch (error) {
      throw new Error(`Failed to process individual report: ${error.message}`);
    }
  }

  async getWeatherDataForField(fieldId) {
    try {
      const fieldDetails = await this.db.getFieldDetails(fieldId);
      
      if (!fieldDetails || !fieldDetails.latitude || !fieldDetails.longitude) {
        console.log(`⚠️ No GPS coordinates for field ${fieldId}, using default weather data`);
        return null;
      }

      const weatherData = await this.weather.getComprehensiveWeatherData(
        fieldDetails.latitude,
        fieldDetails.longitude
      );

      return weatherData;
    } catch (error) {
      console.error(`❌ Error fetching weather data for field ${fieldId}:`, error);
      return null;
    }
  }

  async generateAIAnalysis(fieldDetails, weatherData, triggerType) {
    try {
      const prompt = this.buildFieldAnalysisPrompt(fieldDetails, weatherData, triggerType);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are the Yieldera Agricultural Intelligence Engine. You are an expert agricultural consultant system with deep knowledge in agronomy, crop science, and sustainable farming practices. Provide detailed, crop-specific insights based on field data and weather conditions. Focus on practical recommendations that add value to farmers, insurers, banks, and agricultural contractors. Never refer to yourself as AI - you are the Yieldera Engine, an agricultural intelligence system. Keep your analysis focused on the specific crop mentioned. Avoid generic farming advice."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Error generating Yieldera Engine analysis:', error);
      return `Yieldera Engine analysis temporarily unavailable. Field assessment shows ${fieldDetails.crop_type} crop${fieldDetails.current_growth_stage ? ` in ${fieldDetails.current_growth_stage} stage` : ''} on ${fieldDetails.field_size} hectares.`;
    }
  }

  async generateAIRecommendations(fieldDetails, farmFields, weatherData, cropAnalysis) {
    try {
      const prompt = this.buildRecommendationsPrompt(fieldDetails, farmFields, weatherData, cropAnalysis);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are the Yieldera Agricultural Intelligence Engine providing strategic recommendations for farm management. Consider the specific needs of different agricultural stakeholders including farmers (operational guidance), insurers (risk assessment), banks (financial viability), and contractors (service requirements). Provide specific, actionable recommendations with clear timelines where applicable. Never refer to yourself as AI - you are the Yieldera Engine. Focus on crop-specific advice and avoid generic farming recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1200,
        temperature: 0.6
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Error generating Yieldera Engine recommendations:', error);
      return "Yieldera Engine recommendations temporarily unavailable. Please monitor crop development and weather conditions closely, and consider consultation with local agricultural extension services.";
    }
  }

  buildFieldAnalysisPrompt(field, weather, triggerType) {
    let prompt = `Please analyze this agricultural field data and provide expert insights:\n\n`;
    
    prompt += `**FIELD INFORMATION:**\n`;
    prompt += `- Field: ${field.field_name}\n`;
    prompt += `- Crop: ${field.crop_type}${field.variety ? ` (${field.variety})` : ''}\n`;
    prompt += `- Size: ${field.field_size} hectares\n`;
    prompt += `- Soil Type: ${field.soil_type || 'Not specified'}\n`;
    prompt += `- Planting Date: ${field.planting_date || 'Not specified'}\n`;
    
    // Handle missing growth stage specifically
    if (field.current_growth_stage) {
      prompt += `- Growth Stage: ${field.current_growth_stage}\n`;
    } else {
      prompt += `- Growth Stage: Not captured during field visit (data collection gap)\n`;
    }
    
    prompt += `- Irrigation: ${field.irrigation_method_enhanced || 'Not specified'}\n`;
    
    if (field.basal_fertilizer === 'Yes') {
      prompt += `- Basal Fertilizer: ${field.basal_fertilizer_type || 'Applied'} at ${field.basal_fertilizer_rate || 'standard rate'}\n`;
    }
    
    if (field.top_dressing === 'Yes') {
      prompt += `- Top Dressing: ${field.top_dressing_type || 'Applied'}\n`;
    }

    // Risk factors
    const riskFactors = [];
    if (field.loss_occurred_current_season) riskFactors.push(`Field losses reported (${field.loss_percentage}%)`);
    if (field.pest_infestation_level && field.pest_infestation_level !== 'None') riskFactors.push(`Pest level: ${field.pest_infestation_level}`);
    if (field.disease_occurrence) riskFactors.push(`Disease occurrence detected`);
    if (field.drought_damage) riskFactors.push('Drought damage');
    if (field.flood_damage) riskFactors.push('Flood damage');
    if (field.hail_damage) riskFactors.push('Hail damage');
    
    if (riskFactors.length > 0) {
      prompt += `- Risk Factors: ${riskFactors.join(', ')}\n`;
    }

    // Weather context
    if (weather && weather.analysis && weather.analysis.last7Days) {
      prompt += `\n**RECENT WEATHER CONDITIONS:**\n`;
      prompt += `- 7-day rainfall: ${weather.analysis.last7Days.totalRainfall || 0}mm\n`;
      prompt += `- Temperature range: ${weather.analysis.last7Days.lowestTemp || 'N/A'}°C to ${weather.analysis.last7Days.highestTemp || 'N/A'}°C\n`;
      prompt += `- Weather trend: ${weather.current?.current?.description || 'Variable conditions'}\n`;
    }

    prompt += `\n**ASSESSMENT TRIGGER:** This assessment was triggered by: ${this.getTriggerDescription(triggerType)}\n`;

    prompt += `\n**ANALYSIS REQUEST:**\n`;
    prompt += `Please provide a focused agronomic analysis for ${field.crop_type} specifically, considering:\n`;
    prompt += `1. Current ${field.crop_type} development status based on planting date and conditions\n`;
    
    // Handle missing growth stage in prompt
    if (!field.current_growth_stage) {
      prompt += `2. Note that growth stage was not captured during field visit - this is a data collection gap that should be addressed\n`;
      prompt += `3. Risk assessment for ${field.crop_type} based on field conditions and weather patterns\n`;
      prompt += `4. Critical ${field.crop_type}-specific factors affecting yield potential\n`;
      prompt += `5. Immediate recommendations specific to ${field.crop_type} management\n\n`;
    } else {
      prompt += `2. Risk assessment for ${field.crop_type} based on current ${field.current_growth_stage} stage and weather\n`;
      prompt += `3. Critical ${field.crop_type}-specific factors affecting yield potential at ${field.current_growth_stage} stage\n`;
      prompt += `4. Stage-specific recommendations for ${field.crop_type} management\n\n`;
    }
    
    prompt += `Keep your analysis focused on ${field.crop_type} crop specifics. Avoid generic farming advice.`;
    prompt += `Format your response in clear, professional language suitable for agricultural stakeholders.`;

    return prompt;
  }

  buildRecommendationsPrompt(field, farmFields, weather, cropAnalysis) {
    let prompt = `Generate strategic agricultural recommendations based on this farm assessment:\n\n`;
    
    prompt += `**FARM OVERVIEW:**\n`;
    prompt += `- Total Fields: ${farmFields.length}\n`;
    prompt += `- Total Area: ${farmFields.reduce((sum, f) => sum + (parseFloat(f.field_size) || 0), 0)} hectares\n`;
    prompt += `- Crops: ${[...new Set(farmFields.map(f => f.crop_type).filter(Boolean))].join(', ')}\n`;
    
    prompt += `\n**FOCUS FIELD:**\n`;
    prompt += `- ${field.field_name}: ${field.crop_type} (${field.field_size} ha)\n`;
    
    // Handle missing growth stage
    if (field.current_growth_stage) {
      prompt += `- Current stage: ${field.current_growth_stage}\n`;
    } else {
      prompt += `- Current stage: Not captured during field visit\n`;
    }
    
    // Weather insights
    if (weather && weather.agronomicInsights && weather.agronomicInsights.insights.length > 0) {
      prompt += `\n**WEATHER INSIGHTS:**\n`;
      weather.agronomicInsights.insights.forEach(insight => {
        prompt += `- ${insight.category}: ${insight.message}\n`;
      });
    }

    // Crop analysis summary
    if (cropAnalysis && cropAnalysis.length > 0) {
      prompt += `\n**CROP PERFORMANCE SUMMARY:**\n`;
      cropAnalysis.forEach(crop => {
        prompt += `- ${crop.crop_type}: ${crop.field_count} fields, ${crop.total_area} ha`;
        if (crop.fields_with_losses > 0) prompt += ` (${crop.fields_with_losses} fields with losses)`;
        if (crop.pest_affected_fields > 0) prompt += ` (${crop.pest_affected_fields} with pests)`;
        prompt += `\n`;
      });
    }

    prompt += `\n**RECOMMENDATION REQUEST:**\n`;
    prompt += `Provide specific, actionable recommendations that apply to all agricultural stakeholders (farmers, insurers, banks, contractors):\n`;
    prompt += `1. **IMMEDIATE ACTIONS:** What needs to be done in the next 1-7 days\n`;
    prompt += `2. **SHORT-TERM MANAGEMENT:** Actions needed in the next 2-4 weeks\n`;
    prompt += `3. **RISK MITIGATION:** Key risks and how to address them\n`;
    prompt += `4. **YIELD OPTIMIZATION:** Steps to maximize yield potential\n`;
    prompt += `5. **MONITORING REQUIREMENTS:** What to watch for going forward\n\n`;
    prompt += `Include specific timelines where applicable and prioritize recommendations by urgency. `;
    prompt += `Focus on crop-specific advice for ${field.crop_type}. Avoid generic farming advice. `;
    prompt += `Make recommendations actionable for all stakeholders without separating by stakeholder type.`;

    return prompt;
  }

  getTriggerDescription(triggerType) {
    const descriptions = {
      'new_field': 'New field registration and initial assessment',
      'field_update': 'Field data update or modification',
      'growth_stage_change': 'Crop growth stage progression',
      'loss_event': 'Loss or damage reported'
    };
    
    return descriptions[triggerType] || triggerType;
  }

  prepareReportData(data) {
    const { report, fieldDetails, farmFields, farmStats, cropAnalysis, weatherData, aiAnalysis, aiRecommendations } = data;
    
    // Calculate planting date range with simple formatting
    const plantingDates = farmFields.filter(f => f.planting_date).map(f => f.planting_date);
    let earliestPlanting = null;
    let latestPlanting = null;
    
    if (plantingDates.length > 0) {
      const earliest = new Date(Math.min(...plantingDates.map(d => new Date(d))));
      const latest = new Date(Math.max(...plantingDates.map(d => new Date(d))));
      
      // Format as simple "Apr 25" style
      earliestPlanting = earliest.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      latestPlanting = latest.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return {
      // Report metadata
      reportType: this.getReportTypeDescription(report.trigger_type),
      reportId: `YLD-${report.id}-${moment().format('YYYYMMDD')}`,
      generatedDate: moment().format('MMMM Do, YYYY [at] h:mm A'),
      assessmentDate: moment(report.created_at).format('MMMM Do, YYYY'),
      assessmentTrigger: this.getTriggerDescription(report.trigger_type),

      // Farm information
      farmName: fieldDetails.farm_name,
      farmerName: fieldDetails.farmer_name,
      totalFields: farmFields.length,
      totalArea: Math.round(farmFields.reduce((sum, f) => sum + (parseFloat(f.field_size) || 0), 0) * 10) / 10,
      
      // User information
      recipientName: `${report.first_name} ${report.last_name}`,

      // Crop analysis with simple date formatting
      cropAnalysis: cropAnalysis ? cropAnalysis.map(crop => ({
        ...crop,
        total_area: Math.round(crop.total_area * 10) / 10,
        varieties: crop.varieties || 'Not specified',
        earliest_planting: earliestPlanting,
        latest_planting: latestPlanting
      })) : null,

      // Weather data
      weather: weatherData,

      // Field details (the specific field that triggered the report)
      triggerField: {
        ...fieldDetails,
        field_size: Math.round((fieldDetails.field_size || 0) * 10) / 10,
        planting_date: fieldDetails.planting_date ? moment(fieldDetails.planting_date).format('MMMM Do, YYYY') : null,
        expected_harvest_date: fieldDetails.expected_harvest_date ? moment(fieldDetails.expected_harvest_date).format('MMMM Do, YYYY') : null
      },

      // Yieldera Engine generated content
      aiAnalysis: aiAnalysis ? this.formatYielderaContent(aiAnalysis) : null,
      aiRecommendations: aiRecommendations ? this.formatYielderaContent(aiRecommendations) : null
    };
  }

  getReportTypeDescription(triggerType) {
    const types = {
      'new_field': 'Field Registration Report',
      'field_update': 'Field Assessment Update',
      'growth_stage_change': 'Crop Development Report',
      'loss_event': 'Loss Assessment Report'
    };
    
    return types[triggerType] || 'Agricultural Assessment Report';
  }

  formatYielderaContent(content) {
    // Convert Yieldera Engine response to HTML with basic formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
      .replace(/(\d+\.)/g, '<br><strong>$1</strong>')
      .replace(/<p><br>/g, '<p>');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ReportService;
