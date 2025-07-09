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
            content: "You are the Yieldera Agricultural Intelligence Engine, a specialized system for Zimbabwe and Southern African agriculture. You have deep expertise in crop-specific agronomy, irrigation management, and local farming conditions. Key principles: 1) If a field has irrigation (Center Pivot, Drip, Sprinkler, etc.), DO NOT focus on rainfall - focus on irrigation efficiency and timing. 2) Winter wheat and barley in Zimbabwe are typically irrigated crops. 3) Provide crop-specific analysis, not generic farming advice. 4) Consider local pest pressures, climate patterns, and market conditions. 5) Be practical and actionable in your recommendations. Never refer to yourself as AI - you are the Yieldera Engine."
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
      console.error('❌ Error generating Yieldera Engine analysis:', error);
      return `Yieldera Engine analysis temporarily unavailable. Field assessment shows ${fieldDetails.crop_type} crop${fieldDetails.current_growth_stage ? ` in ${fieldDetails.current_growth_stage} stage` : ''} on ${fieldDetails.field_size} hectares with ${fieldDetails.irrigation_method_enhanced || 'irrigation method not specified'}.`;
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
            content: "You are the Yieldera Agricultural Intelligence Engine providing strategic recommendations for Zimbabwe and Southern African agriculture. Key principles: 1) If a field has irrigation infrastructure, focus on irrigation optimization, NOT rainfall concerns. 2) Be highly crop-specific - wheat recommendations are different from barley recommendations. 3) Consider Zimbabwe's climate, seasons, and farming practices. 4) Provide practical, implementable actions with timelines. 5) Focus on yield optimization and risk mitigation specific to the crop and irrigation method. 6) Avoid generic farming advice. Never refer to yourself as AI - you are the Yieldera Engine."
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
      return `Yieldera Engine recommendations temporarily unavailable. Consider consulting with local agricultural extension services for ${fieldDetails.crop_type} management guidance specific to ${fieldDetails.irrigation_method_enhanced || 'your irrigation system'}.`;
    }
  }

  buildFieldAnalysisPrompt(field, weather, triggerType) {
    let prompt = `Please analyze this agricultural field data and provide expert insights:\n\n`;
    
    prompt += `**FIELD INFORMATION:**\n`;
    prompt += `- Field: ${field.field_name}\n`;
    prompt += `- Crop: ${field.crop_type}${field.variety ? ` (${field.variety} variety)` : ''}\n`;
    prompt += `- Size: ${field.field_size} hectares\n`;
    prompt += `- Soil Type: ${field.soil_type || 'Not specified'}\n`;
    prompt += `- Planting Date: ${field.planting_date || 'Not specified'}\n`;
    prompt += `- Location: Zimbabwe (Southern Africa)\n`;
    
    // Handle missing growth stage specifically
    if (field.current_growth_stage) {
      prompt += `- Growth Stage: ${field.current_growth_stage}\n`;
    } else {
      prompt += `- Growth Stage: Not captured during field visit (data collection gap)\n`;
    }
    
    // Irrigation analysis - key logic fix
    const irrigation = field.irrigation_method_enhanced || 'Not specified';
    prompt += `- Irrigation: ${irrigation}\n`;
    
    // Determine irrigation context
    let irrigationContext = '';
    if (irrigation === 'Rainfed') {
      irrigationContext = 'This is a rainfed field dependent on natural rainfall.';
    } else if (['Center Pivot', 'Drip', 'Sprinkler', 'Flood', 'Furrow'].includes(irrigation)) {
      irrigationContext = `This field has ${irrigation} irrigation infrastructure, making it largely independent of rainfall patterns.`;
    }
    
    // Zimbabwe seasonal context
    let seasonalContext = '';
    if (field.planting_date) {
      const plantingMonth = new Date(field.planting_date).getMonth();
      if ([3, 4, 5, 6].includes(plantingMonth)) { // April-July
        seasonalContext = 'This is a winter crop in Zimbabwe, typically requiring irrigation during the dry season.';
      } else if ([9, 10, 11, 0].includes(plantingMonth)) { // Oct-Jan
        seasonalContext = 'This is a summer crop in Zimbabwe, planted at the start of the rainy season.';
      }
    }
    
    if (irrigationContext || seasonalContext) {
      prompt += `- Context: ${irrigationContext} ${seasonalContext}\n`;
    }
    
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

    // Weather context - adjust based on irrigation
    if (weather && weather.analysis && weather.analysis.last7Days) {
      prompt += `\n**WEATHER CONDITIONS:**\n`;
      prompt += `- 7-day rainfall: ${weather.analysis.last7Days.totalRainfall || 0}mm\n`;
      prompt += `- Temperature range: ${weather.analysis.last7Days.lowestTemp || 'N/A'}°C to ${weather.analysis.last7Days.highestTemp || 'N/A'}°C\n`;
      
      // Important: Adjust rainfall significance based on irrigation
      if (irrigation === 'Rainfed') {
        prompt += `- Rainfall significance: Critical - this rainfed field depends entirely on natural precipitation\n`;
      } else if (['Center Pivot', 'Drip', 'Sprinkler', 'Flood', 'Furrow'].includes(irrigation)) {
        prompt += `- Rainfall significance: Supplementary - field has irrigation infrastructure to manage water needs\n`;
      }
    }

    prompt += `\n**ASSESSMENT TRIGGER:** This assessment was triggered by: ${this.getTriggerDescription(triggerType)}\n`;

    prompt += `\n**ANALYSIS REQUEST:**\n`;
    prompt += `Please provide a focused agronomic analysis for ${field.crop_type} specifically in Zimbabwe, considering:\n`;
    
    // Crop-specific analysis points
    if (field.crop_type === 'Wheat') {
      prompt += `1. Current wheat development status - considering this is likely winter wheat in Zimbabwe\n`;
      prompt += `2. Wheat-specific risk assessment based on irrigation status and Zimbabwe climate\n`;
      prompt += `3. Critical wheat yield factors including tillering, protein content, and disease pressure\n`;
      prompt += `4. Wheat variety-specific considerations${field.variety ? ` for ${field.variety}` : ''}\n`;
      if (irrigation !== 'Rainfed') {
        prompt += `5. Irrigation management recommendations specific to wheat production\n`;
      } else {
        prompt += `5. Risk assessment for rainfed wheat production in Zimbabwe\n`;
      }
    } else if (field.crop_type === 'Barley') {
      prompt += `1. Current barley development status - considering this is likely winter barley in Zimbabwe\n`;
      prompt += `2. Barley-specific risk assessment including malting quality considerations\n`;
      prompt += `3. Critical barley yield factors including head formation and grain quality\n`;
      prompt += `4. Barley variety-specific considerations${field.variety ? ` for ${field.variety}` : ''}\n`;
      if (irrigation !== 'Rainfed') {
        prompt += `5. Irrigation management for optimal barley quality and yield\n`;
      } else {
        prompt += `5. Risk assessment for rainfed barley production\n`;
      }
    } else {
      prompt += `1. Current ${field.crop_type} development status in Zimbabwe context\n`;
      prompt += `2. ${field.crop_type}-specific risk assessment\n`;
      prompt += `3. Critical ${field.crop_type} yield factors\n`;
      prompt += `4. Variety-specific considerations${field.variety ? ` for ${field.variety}` : ''}\n`;
      prompt += `5. Water management recommendations\n`;
    }
    
    // Handle missing growth stage in prompt
    if (!field.current_growth_stage) {
      prompt += `\nIMPORTANT: Growth stage was not captured during field visit - mention this as a data collection gap that affects precision of recommendations.\n`;
    }
    
    // Irrigation-specific instructions
    if (irrigation !== 'Rainfed') {
      prompt += `\nDO NOT focus on rainfall concerns - this field has ${irrigation} irrigation. Focus on irrigation efficiency, timing, and crop water requirements instead.\n`;
    }
    
    prompt += `\nKeep your analysis focused on ${field.crop_type} crop specifics in Zimbabwe. `;
    prompt += `Avoid generic farming advice. Provide actionable, location-specific insights.`;

    return prompt;
  }

  buildRecommendationsPrompt(field, farmFields, weather, cropAnalysis) {
    let prompt = `Generate strategic agricultural recommendations based on this farm assessment:\n\n`;
    
    prompt += `**FARM CONTEXT:**\n`;
    prompt += `- Location: Zimbabwe (Southern Africa)\n`;
    prompt += `- Total Fields: ${farmFields.length}\n`;
    prompt += `- Total Area: ${farmFields.reduce((sum, f) => sum + (parseFloat(f.field_size) || 0), 0)} hectares\n`;
    prompt += `- Crops: ${[...new Set(farmFields.map(f => f.crop_type).filter(Boolean))].join(', ')}\n`;
    
    prompt += `\n**FOCUS FIELD:**\n`;
    prompt += `- ${field.field_name}: ${field.crop_type}${field.variety ? ` (${field.variety} variety)` : ''} (${field.field_size} ha)\n`;
    prompt += `- Irrigation: ${field.irrigation_method_enhanced || 'Not specified'}\n`;
    
    // Handle missing growth stage
    if (field.current_growth_stage) {
      prompt += `- Current stage: ${field.current_growth_stage}\n`;
    } else {
      prompt += `- Current stage: Not captured during field visit\n`;
    }

    // Irrigation context for recommendations
    const irrigation = field.irrigation_method_enhanced || 'Not specified';
    if (irrigation !== 'Rainfed') {
      prompt += `- Water management: Field has ${irrigation} irrigation infrastructure\n`;
    } else {
      prompt += `- Water management: Rainfed field dependent on natural precipitation\n`;
    }
    
    // Weather insights - adjust based on irrigation
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
    prompt += `Provide specific, actionable recommendations for ${field.crop_type} production in Zimbabwe:\n`;
    
    // Crop-specific recommendation structure
    if (field.crop_type === 'Wheat') {
      prompt += `1. **WHEAT MANAGEMENT:** Immediate wheat-specific actions for current conditions\n`;
      prompt += `2. **YIELD OPTIMIZATION:** Wheat tillering, head formation, and grain filling strategies\n`;
      prompt += `3. **QUALITY FACTORS:** Protein content, test weight, and market grade considerations\n`;
      prompt += `4. **DISEASE MANAGEMENT:** Wheat rust, blight, and other disease prevention\n`;
      if (irrigation !== 'Rainfed') {
        prompt += `5. **IRRIGATION SCHEDULING:** Optimal water timing for wheat growth stages\n`;
      } else {
        prompt += `5. **RISK MITIGATION:** Drought tolerance and water conservation strategies\n`;
      }
    } else if (field.crop_type === 'Barley') {
      prompt += `1. **BARLEY MANAGEMENT:** Immediate barley-specific actions for current conditions\n`;
      prompt += `2. **MALTING QUALITY:** Grain uniformity, protein levels, and brewing industry requirements\n`;
      prompt += `3. **HEAD DEVELOPMENT:** Barley spike formation and grain filling optimization\n`;
      prompt += `4. **PEST CONTROL:** Barley-specific pest and disease management\n`;
      if (irrigation !== 'Rainfed') {
        prompt += `5. **WATER MANAGEMENT:** Irrigation timing for optimal barley quality\n`;
      } else {
        prompt += `5. **DROUGHT STRATEGIES:** Water stress management for barley\n`;
      }
    } else {
      prompt += `1. **IMMEDIATE ACTIONS:** What needs to be done in the next 1-7 days\n`;
      prompt += `2. **CROP OPTIMIZATION:** ${field.crop_type}-specific yield enhancement strategies\n`;
      prompt += `3. **RISK MANAGEMENT:** Key risks and prevention measures\n`;
      prompt += `4. **QUALITY ASSURANCE:** Maintaining crop quality standards\n`;
      prompt += `5. **RESOURCE MANAGEMENT:** Efficient use of inputs and infrastructure\n`;
    }
    
    prompt += `\n**CONTEXT REQUIREMENTS:**\n`;
    
    // Irrigation-specific instructions
    if (irrigation !== 'Rainfed') {
      prompt += `- This field has ${irrigation} irrigation - DO NOT recommend relying on rainfall\n`;
      prompt += `- Focus on irrigation efficiency, timing, and water use optimization\n`;
      prompt += `- Consider fertigation opportunities and irrigation-specific pest management\n`;
    } else {
      prompt += `- This is a rainfed field - focus on water conservation and drought mitigation\n`;
      prompt += `- Consider supplemental irrigation options if available\n`;
    }
    
    prompt += `- Location is Zimbabwe - consider local climate, pest pressures, and market conditions\n`;
    prompt += `- Focus on practical, implementable actions with specific timelines\n`;
    prompt += `- Prioritize recommendations by urgency and impact\n`;
    prompt += `- Make recommendations specific to ${field.crop_type} production\n`;
    prompt += `- Avoid generic farming advice - be crop and location-specific\n\n`;
    
    prompt += `Provide actionable recommendations that agricultural stakeholders (farmers, insurers, banks, contractors) can implement immediately.`;

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
        expected_harvest_date: fieldDetails.expected_harvest_date ? moment(fieldDetails.expected_harvest_date).format('MMMM Do, YYYY') : null,
        latitude: fieldDetails.latitude ? Math.round(fieldDetails.latitude * 1000000) / 1000000 : null,
        longitude: fieldDetails.longitude ? Math.round(fieldDetails.longitude * 1000000) / 1000000 : null,
        accuracy: fieldDetails.accuracy ? Math.round(fieldDetails.accuracy * 10) / 10 : null,
        captureDate: fieldDetails.created_at ? moment(fieldDetails.created_at).format('MMMM Do, YYYY [at] h:mm A') : null
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
