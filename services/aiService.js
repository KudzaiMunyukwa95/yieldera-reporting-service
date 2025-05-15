const axios = require('axios');
require('dotenv').config();

// OpenAI API key should be added to Render environment
const openaiApiKey = process.env.OPENAI_API_KEY;

/**
 * Analyzes field data and weather data to generate agronomic report
 */
async function analyzeWithAI(fieldData, weatherData, forecastData) {
  try {
    // Try OpenAI first
    if (openaiApiKey) {
      console.log("Analyzing field data with OpenAI...");
      try {
        const openAiReport = await analyzeWithOpenAI(fieldData, weatherData, forecastData);
        return openAiReport;
      } catch (error) {
        console.error("OpenAI analysis failed:", error.message);
        console.log("Falling back to rule-based analysis...");
      }
    } else {
      console.log("No OpenAI API key found. Using rule-based analysis.");
    }
    
    // Fallback to rule-based analysis
    return alternativeAnalysis(fieldData, weatherData);
  } catch (error) {
    console.error("AI analysis error:", error);
    return alternativeAnalysis(fieldData, weatherData);
  }
}

/**
 * Analyze field data using OpenAI
 */
async function analyzeWithOpenAI(fieldData, weatherData, forecastData) {
  // Generate prompt for OpenAI
  const prompt = generateOpenAIPrompt(fieldData, weatherData, forecastData);
  
  // Log the prompt for debugging (remove in production)
  // console.log("OpenAI Prompt:", prompt);
  
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert agricultural analyst specializing in Zimbabwe farming practices. Your task is to generate a detailed agronomic report with practical, actionable recommendations based on field data and weather conditions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    },
    {
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  // Extract the response content
  const analysis = response.data.choices[0].message.content.trim();
  
  // Format the analysis as Markdown if not already
  let formattedAnalysis = analysis;
  if (!analysis.includes('#')) {
    formattedAnalysis = formatAnalysisToMarkdown(analysis);
  }

  return {
    success: true,
    analysis: formattedAnalysis,
    source: "openai"
  };
}

/**
 * Generate detailed prompt for OpenAI
 */
function generateOpenAIPrompt(fieldData, weatherData, forecastData) {
  // Determine Zimbabwe's natural farming region based on coordinates
  const farmingRegion = determineZimbabweFarmingRegion(fieldData.latitude, fieldData.longitude);
  
  // Calculate days since planting
  let daysSincePlanting = "Unknown";
  let growthStageInfo = "Unknown growth stage";
  
  if (fieldData.planting_date) {
    try {
      const plantingDate = new Date(fieldData.planting_date);
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - plantingDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysSincePlanting = diffDays;
      
      // Add growth stage information based on crop type and days since planting
      growthStageInfo = getCropGrowthStageInfo(fieldData.crop_type, diffDays, fieldData.growth_stage);
    } catch (error) {
      console.log("Error calculating days since planting:", error.message);
    }
  }
  
  // Format weather summary
  let weatherSummary = "Weather data unavailable.";
  let weatherForecast = "Forecast unavailable.";
  
  if (weatherData && weatherData.daily) {
    try {
      const temps = weatherData.daily.temperature_2m_max;
      const avgMaxTemp = average(temps).toFixed(1);
      const avgMinTemp = average(weatherData.daily.temperature_2m_min).toFixed(1);
      const totalRain = sum(weatherData.daily.precipitation_sum).toFixed(1);
      
      weatherSummary = `Last 30 days: Avg max temp: ${avgMaxTemp}°C, Avg min temp: ${avgMinTemp}°C, Total rainfall: ${totalRain}mm.`;
      
      // Check for extreme conditions
      if (avgMaxTemp > 32) {
        weatherSummary += " Temperatures have been unusually high.";
      } else if (avgMaxTemp < 15) {
        weatherSummary += " Temperatures have been unusually low.";
      }
      
      if (totalRain < 10) {
        weatherSummary += " Rainfall has been significantly below normal.";
      } else if (totalRain > 150) {
        weatherSummary += " Rainfall has been significantly above normal.";
      }
    } catch (error) {
      console.log("Error processing historical weather:", error.message);
    }
  }
  
  if (forecastData && forecastData.daily) {
    try {
      const forecastMaxTemp = average(forecastData.daily.temperature_2m_max).toFixed(1);
      const forecastMinTemp = average(forecastData.daily.temperature_2m_min).toFixed(1);
      const forecastRain = sum(forecastData.daily.precipitation_sum).toFixed(1);
      
      weatherForecast = `Next 7 days: Expected max temp: ${forecastMaxTemp}°C, Expected min temp: ${forecastMinTemp}°C, Expected rainfall: ${forecastRain}mm.`;
    } catch (error) {
      console.log("Error processing forecast weather:", error.message);
    }
  }
  
  // Get field health assessment
  const fieldHealth = assessFieldHealth(fieldData);
  
  return `
Please generate a detailed agricultural report for a farmer in Zimbabwe. The report should include a weather analysis, specific recommendations, potential risks, and opportunities for optimization. Format the output with clear Markdown headings (##, ###) for each section.

## Field Information:
- Crop Type: ${fieldData.crop_type || 'Not specified'}
- Variety: ${fieldData.variety || 'Not specified'}
- Field Size: ${fieldData.field_size || 'Not specified'} hectares
- Soil Type: ${fieldData.soil_type || 'Not specified'}
- Planting Date: ${fieldData.planting_date || 'Not specified'} (${daysSincePlanting} days ago)
- Current Growth Stage: ${fieldData.growth_stage || 'Not specified'}
- Growth Stage Assessment: ${growthStageInfo}
- Farm Location: ${farmingRegion.region} (${farmingRegion.description})
- GPS Coordinates: Latitude ${fieldData.latitude || 'Not specified'}, Longitude ${fieldData.longitude || 'Not specified'}

## Field Management:
- Irrigation Type: ${fieldData.irrigation_type || 'Not specified'}
- Basal Fertilizer: ${fieldData.basal_fertilizer || 'Not specified'} (${fieldData.basal_fertilizer_amount || 'amount not specified'})
- Top Dressing: ${fieldData.top_dressing || 'Not specified'} (${fieldData.top_dressing_amount || 'amount not specified'})
- Last Yield: ${fieldData.last_yield || 'Not specified'} (${fieldData.last_yield_unit || 'unit not specified'})
- Last Yield Comparison: ${fieldData.last_yield_compare || 'Not specified'}

## Field Health:
- Pest Infestation: ${fieldData.pest_infestation || 'Not specified'}
- Pest Control Methods: ${fieldData.pest_control || 'Not specified'}
- Signs of Diseases: ${fieldData.signs_of_diseases || 'Not specified'} 
- Weed Pressure: ${fieldData.weed_pressure || 'Not specified'}
- Field Health Assessment: ${fieldHealth}

## Weather Conditions:
- Historical Weather: ${weatherSummary}
- Weather Forecast: ${weatherForecast}

Based on this information, please provide:

1. A concise analysis of current field conditions and the suitability of the crop for this farming region
2. Specific, actionable recommendations for managing this crop at its current growth stage
3. Potential risks based on the weather, field conditions, and regional factors
4. Opportunities for optimizing yield and quality

Focus on practical advice specific to Zimbabwe's agricultural conditions. Include expected outcomes if the recommendations are followed.
`;
}

/**
 * Determine Zimbabwe's natural farming region based on GPS coordinates
 */
function determineZimbabweFarmingRegion(latitude, longitude) {
  // This is a simplified approximation
  // In a real implementation, you would use GIS data or a more sophisticated algorithm
  
  // Default if coordinates are not provided
  if (!latitude || !longitude) {
    return {
      region: "Unknown Region",
      description: "region not determined due to missing coordinates"
    };
  }
  
  // Very rough approximations - these should be replaced with actual GIS data
  // Region I: Eastern Highlands
  if (longitude > 32.0 && latitude < -18.5) {
    return {
      region: "Natural Region I",
      description: "specialized and diversified farming region with > 1000mm rainfall annually"
    };
  }
  // Region II: Northeastern Zimbabwe
  else if (longitude > 30.5 && latitude < -17.0) {
    return {
      region: "Natural Region II",
      description: "intensive farming region with 750-1000mm rainfall annually"
    };
  }
  // Region III: Central Zimbabwe
  else if (longitude > 29.0 && latitude < -19.0) {
    return {
      region: "Natural Region III",
      description: "semi-intensive farming region with 650-800mm rainfall annually"
    };
  }
  // Region IV: Western and Southern Zimbabwe
  else if (longitude < 29.0 || latitude > -17.0) {
    return {
      region: "Natural Region IV",
      description: "semi-extensive farming region with 450-650mm rainfall annually"
    };
  }
  // Region V: Southern Zimbabwe
  else {
    return {
      region: "Natural Region V",
      description: "extensive farming region with < 450mm rainfall annually"
    };
  }
}

/**
 * Get information about the crop's growth stage
 */
function getCropGrowthStageInfo(cropType, daysSincePlanting, reportedStage) {
  if (!cropType) return "Unable to determine growth stage due to missing crop type";
  
  // Use reported stage if available
  if (reportedStage) {
    return `Reported as ${reportedStage}`;
  }
  
  // Estimate based on crop type and days since planting
  switch (cropType.toLowerCase()) {
    case 'maize':
      if (daysSincePlanting < 15) return "Early vegetative stage (emergence to V3)";
      if (daysSincePlanting < 40) return "Vegetative stage (V4 to V8)";
      if (daysSincePlanting < 70) return "Reproductive stage beginning (V9 to VT, tasseling)";
      if (daysSincePlanting < 100) return "Reproductive stage (R1 silking to R3 milk)";
      if (daysSincePlanting < 130) return "Maturing stage (R4 dough to R5 dent)";
      return "Harvest stage (R6 physiological maturity)";
      
    case 'wheat':
      if (daysSincePlanting < 20) return "Seedling growth";
      if (daysSincePlanting < 45) return "Tillering";
      if (daysSincePlanting < 70) return "Stem extension";
      if (daysSincePlanting < 85) return "Heading and flowering";
      if (daysSincePlanting < 120) return "Grain filling";
      return "Ripening and maturity";
      
    case 'cotton':
      if (daysSincePlanting < 25) return "Emergence and seedling establishment";
      if (daysSincePlanting < 60) return "Vegetative growth";
      if (daysSincePlanting < 90) return "Squaring and early bloom";
      if (daysSincePlanting < 120) return "Flowering and boll development";
      if (daysSincePlanting < 160) return "Boll opening and maturation";
      return "Harvest stage";
      
    case 'soybean':
      if (daysSincePlanting < 15) return "Emergence and seedling (VE-VC)";
      if (daysSincePlanting < 45) return "Vegetative stages (V1-V5)";
      if (daysSincePlanting < 75) return "Flowering and pod development (R1-R3)";
      if (daysSincePlanting < 100) return "Pod filling (R4-R5)";
      if (daysSincePlanting < 120) return "Seed maturation (R6-R7)";
      return "Harvest maturity (R8)";
      
    default:
      return `${daysSincePlanting} days since planting`;
  }
}

/**
 * Assess field health based on available data
 */
function assessFieldHealth(fieldData) {
  const healthIssues = [];
  
  if (fieldData.pest_infestation === 'Yes' || fieldData.pest_infestation === 'yes') {
    healthIssues.push("Pest infestation present");
  }
  
  if (fieldData.signs_of_diseases && 
      (fieldData.signs_of_diseases === 'Yes' || 
       fieldData.signs_of_diseases === 'yes' || 
       fieldData.signs_of_diseases.toLowerCase().includes('yes'))) {
    healthIssues.push("Disease symptoms observed");
  }
  
  if (fieldData.weed_pressure && 
      (fieldData.weed_pressure === 'High' || 
       fieldData.weed_pressure === 'high' || 
       fieldData.weed_pressure.toLowerCase().includes('high'))) {
    healthIssues.push("High weed pressure");
  }
  
  if (healthIssues.length === 0) {
    return "No major health issues reported";
  }
  
  return healthIssues.join(", ");
}

/**
 * Format plain text analysis to Markdown
 */
function formatAnalysisToMarkdown(text) {
  // Split by new lines and look for sections
  const lines = text.split('\n');
  let formatted = `## Field Analysis Report\n\n`;
  
  let currentSection = '';
  let sectionContent = [];
  
  // Try to identify sections
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) continue;
    
    // Check if this line looks like a section header
    if (
      trimmedLine.toLowerCase().includes('analysis') ||
      trimmedLine.toLowerCase().includes('recommendations') ||
      trimmedLine.toLowerCase().includes('risks') ||
      trimmedLine.toLowerCase().includes('opportunities') ||
      /^\d+\.\s+[A-Z]/.test(trimmedLine) // numbered point starting with capital letter
    ) {
      // If we have content from a previous section, add it
      if (currentSection && sectionContent.length) {
        formatted += `### ${currentSection}\n`;
        for (const content of sectionContent) {
          formatted += `- ${content}\n`;
        }
        formatted += '\n';
      }
      
      // Start new section
      currentSection = trimmedLine.replace(/^\d+\.\s+/, ''); // Remove numbering if present
      sectionContent = [];
    } else {
      // Add to current section content
      sectionContent.push(trimmedLine);
    }
  }
  
  // Add the last section
  if (currentSection && sectionContent.length) {
    formatted += `### ${currentSection}\n`;
    for (const content of sectionContent) {
      formatted += `- ${content}\n`;
    }
  }
  
  return formatted;
}

/**
 * Alternative analysis when OpenAI is unavailable
 * Uses rule-based analysis for common crops
 */
function alternativeAnalysis(fieldData, weatherData) {
  // Extract relevant data
  const { crop_type, soil_type, planting_date, field_size } = fieldData;
  
  // Create analysis object
  const analysis = {
    summary: `Analysis for ${field_size || 'Unknown size'}ha of ${crop_type || 'crops'} planted on ${planting_date || 'unknown date'}`,
    recommendations: [],
    risks: [],
    opportunities: []
  };
  
  // Weather analysis
  const weatherSummary = analyzeWeather(weatherData, crop_type);
  
  // Crop-specific analysis
  let cropAnalysis;
  if (!crop_type) {
    cropAnalysis = generalCropAnalysis(fieldData, weatherData);
  } else {
    switch (crop_type.toLowerCase()) {
      case 'maize':
        cropAnalysis = analyzeMaize(fieldData, weatherData);
        break;
      case 'wheat':
        cropAnalysis = analyzeWheat(fieldData, weatherData);
        break;
      case 'soybean':
        cropAnalysis = analyzeSoybean(fieldData, weatherData);
        break;
      case 'cotton':
        cropAnalysis = analyzeCotton(fieldData, weatherData);
        break;
      case 'tobacco':
        cropAnalysis = analyzeTobacco(fieldData, weatherData);
        break;
      case 'groundnut':
        cropAnalysis = analyzeGroundnut(fieldData, weatherData);
        break;
      case 'sunflower':
        cropAnalysis = analyzeSunflower(fieldData, weatherData);
        break;
      case 'sorghum':
        cropAnalysis = analyzeSorghum(fieldData, weatherData);
        break;
      default:
        cropAnalysis = generalCropAnalysis(fieldData, weatherData);
    }
  }
  
  // Combine analyses
  return {
    success: true,
    analysis: formatAnalysis({
      ...analysis,
      weather: weatherSummary,
      ...cropAnalysis
    }),
    source: "rule-based"
  };
}

/**
 * Helper function to analyze weather data
 */
function analyzeWeather(weatherData, cropType) {
  if (!weatherData || !weatherData.daily) {
    return "Weather data unavailable. Please check local forecasts.";
  }
  
  // Simple weather analysis
  const temps = weatherData.daily.temperature_2m_max;
  const avgTemp = temps.reduce((sum, temp) => sum + temp, 0) / temps.length;
  const totalRain = weatherData.daily.precipitation_sum.reduce((sum, rain) => sum + rain, 0);
  
  let summary = `Recent average temperature: ${avgTemp.toFixed(1)}°C. `;
  summary += `Total rainfall: ${totalRain.toFixed(1)}mm. `;
  
  // Very simple crop-specific weather analysis
  if (cropType && cropType.toLowerCase() === 'maize') {
    if (avgTemp > 30) {
      summary += "Temperatures are higher than optimal for maize development.";
    } else if (avgTemp < 18) {
      summary += "Temperatures are lower than optimal for maize growth.";
    } else {
      summary += "Temperature conditions are favorable for maize.";
    }
    
    if (totalRain < 10) {
      summary += " Current rainfall is insufficient for optimal maize growth. Consider irrigation.";
    } else if (totalRain > 50) {
      summary += " Heavy rainfall may cause waterlogging. Ensure proper drainage.";
    }
  } else if (cropType && cropType.toLowerCase() === 'cotton') {
    if (avgTemp > 35) {
      summary += "Temperatures are too high for optimal cotton development. Consider additional irrigation.";
    } else if (avgTemp < 15) {
      summary += "Temperatures are lower than optimal for cotton growth. Growth may be slower than expected.";
    } else {
      summary += "Temperature conditions are favorable for cotton.";
    }
    
    if (totalRain < 10) {
      summary += " Current rainfall is insufficient for optimal cotton growth. Consider irrigation.";
    } else if (totalRain > 40) {
      summary += " Heavy rainfall may increase risk of boll rot. Monitor closely.";
    }
  }
  
  return summary;
}

// The existing crop-specific analysis functions can remain unchanged
function analyzeMaize(fieldData, weatherData) {
  const analysis = {
    recommendations: [
      "Apply nitrogen fertilizer in split applications to maximize efficiency.",
      "Monitor for fall armyworm, a common pest in maize in Zimbabwe.",
      "Ensure adequate soil moisture during the critical tasseling and silking stages."
    ],
    risks: [
      "Extended dry periods during silking stage can significantly reduce yield.",
      "Heavy rainfall can lead to nitrogen leaching; adjust fertilization accordingly."
    ],
    opportunities: [
      "Consider intercropping with legumes to improve soil fertility.",
      "Proper timing of harvest can minimize post-harvest losses."
    ]
  };
  
  // Add soil-specific recommendations
  if (fieldData.soil_type && fieldData.soil_type.toLowerCase() === 'sandy') {
    analysis.recommendations.push("Sandy soils benefit from additional organic matter to improve water retention.");
    analysis.recommendations.push("Consider more frequent but lighter irrigation for sandy soils.");
  } else if (fieldData.soil_type && fieldData.soil_type.toLowerCase() === 'clay') {
    analysis.recommendations.push("Clay soils may require special attention to drainage to prevent waterlogging.");
    analysis.recommendations.push("Avoid working with clay soil when it's too wet to prevent compaction.");
  }
  
  // Add pest-specific recommendations if pest problems reported
  if (fieldData.pest_infestation === 'Yes') {
    analysis.recommendations.push("For maize, common pests include fall armyworm and stalk borers. Consider appropriate insecticides.");
    analysis.recommendations.push("Implement integrated pest management practices like crop rotation and natural predators.");
  }
  
  return analysis;
}

function analyzeWheat(fieldData, weatherData) {
  return {
    recommendations: [
      "Maintain proper irrigation scheduling for optimal wheat development.",
      "Monitor for rust diseases, especially in humid conditions.",
      "Apply appropriate fungicides if disease pressure increases."
    ],
    risks: [
      "Late season heat can affect grain filling and reduce quality.",
      "Heavy rainfall during harvest can lead to sprouting and quality loss."
    ],
    opportunities: [
      "Optimal nitrogen management can significantly improve protein content and yield.",
      "Early planting can help avoid heat stress during grain filling."
    ]
  };
}

function analyzeSoybean(fieldData, weatherData) {
  return {
    recommendations: [
      "Ensure proper inoculation with rhizobium bacteria for nitrogen fixation.",
      "Maintain adequate soil moisture during pod filling stage.",
      "Scout regularly for pests like soybean aphids and stink bugs."
    ],
    risks: [
      "Drought stress during flowering and pod set can significantly reduce yield.",
      "Excessive moisture can promote fungal diseases like root rot."
    ],
    opportunities: [
      "Soybeans fix nitrogen, reducing fertilizer needs for subsequent crops.",
      "Consider closer row spacing to maximize canopy coverage and yield."
    ]
  };
}

function analyzeCotton(fieldData, weatherData) {
  return {
    recommendations: [
      "Monitor for bollworms and apply appropriate pest control measures.",
      "Maintain consistent soil moisture during flowering and boll development.",
      "Consider growth regulators for excessive vegetative growth management."
    ],
    risks: [
      "Heavy rainfall during boll opening can reduce fiber quality.",
      "Late season water stress can reduce fiber quality and yield."
    ],
    opportunities: [
      "Proper defoliation timing can improve harvest efficiency and quality.",
      "Cotton responds well to precise nutrient management; soil testing is recommended."
    ]
  };
}

function analyzeTobacco(fieldData, weatherData) {
  return {
    recommendations: [
      "Monitor nitrogen levels closely as they affect leaf quality and nicotine content.",
      "Implement strict pest and disease management to maintain leaf quality.",
      "Maintain even irrigation to avoid stress that can affect leaf quality."
    ],
    risks: [
      "Excessive rainfall can lead to fungal diseases like blue mold and black shank.",
      "Drought stress can significantly reduce yield and quality.",
      "Incorrect topping and sucker control can reduce yield and quality."
    ],
    opportunities: [
      "Proper curing techniques have significant impact on final leaf quality and price.",
      "Attention to detail in harvesting timing can improve quality grades."
    ]
  };
}

function analyzeGroundnut(fieldData, weatherData) {
  return {
    recommendations: [
      "Calcium is critical during pod formation; ensure adequate levels through soil testing.",
      "Maintain consistent soil moisture, especially during flowering and pod development.",
      "Monitor for early and late leaf spot diseases and implement fungicide programs if needed."
    ],
    risks: [
      "Aflatoxin contamination is a serious risk, especially in drought conditions followed by rain.",
      "Drought stress during pod filling can significantly reduce yield and quality."
    ],
    opportunities: [
      "Groundnuts improve soil fertility for subsequent crops through nitrogen fixation.",
      "Good weed control early in the season is essential for maximum yields."
    ]
  };
}

function analyzeSunflower(fieldData, weatherData) {
  return {
    recommendations: [
      "Consider boron application if soil tests indicate deficiency; critical for seed set.",
      "Control weeds early as sunflowers compete poorly in early growth stages.",
      "Monitor for bird damage as heads begin to form and mature."
    ],
    risks: [
      "Drought stress during flowering can significantly reduce yield.",
      "Head rot diseases can be problematic in humid conditions."
    ],
    opportunities: [
      "Sunflowers have deep taproots that can access water and nutrients unavailable to other crops.",
      "Their drought tolerance makes them suitable for marginal areas or late planting situations."
    ]
  };
}

function analyzeSorghum(fieldData, weatherData) {
  return {
    recommendations: [
      "Control weeds early as sorghum grows slowly in initial stages.",
      "Monitor for sorghum midge during flowering.",
      "Bird damage can be significant; consider control measures as grain develops."
    ],
    risks: [
      "Head smut and covered kernel smut can reduce yield and quality.",
      "Drought stress during boot and flowering stages is most damaging to yield."
    ],
    opportunities: [
      "Sorghum is more drought-tolerant than maize, making it suitable for drier areas.",
      "Has lower nitrogen requirements than maize, reducing input costs."
    ]
  };
}

function generalCropAnalysis(fieldData, weatherData) {
  return {
    recommendations: [
      "Regularly monitor crop development and adjust management practices accordingly.",
      "Implement integrated pest management to minimize chemical inputs.",
      "Maintain adequate soil moisture throughout the growing season."
    ],
    risks: [
      "Weather extremes can significantly impact crop development and yield.",
      "Pest and disease pressure may increase under certain weather conditions."
    ],
    opportunities: [
      "Regular soil testing can help optimize fertilizer applications.",
      "Consider crop rotation to break pest cycles and improve soil health."
    ]
  };
}

/**
 * Format analysis into readable text
 */
function formatAnalysis(analysis) {
  let text = `## ${analysis.summary}\n\n`;
  
  if (analysis.weather) {
    text += `### Weather Analysis\n${analysis.weather}\n\n`;
  }
  
  if (analysis.recommendations && analysis.recommendations.length) {
    text += "### Recommendations\n";
    analysis.recommendations.forEach(rec => {
      text += `- ${rec}\n`;
    });
    text += "\n";
  }
  
  if (analysis.risks && analysis.risks.length) {
    text += "### Potential Risks\n";
    analysis.risks.forEach(risk => {
      text += `- ${risk}\n`;
    });
    text += "\n";
  }
  
  if (analysis.opportunities && analysis.opportunities.length) {
    text += "### Opportunities\n";
    analysis.opportunities.forEach(opp => {
      text += `- ${opp}\n`;
    });
  }
  
  return text;
}

// Helper functions
function average(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return 0;
  }
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function sum(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return 0;
  }
  return arr.reduce((sum, val) => sum + val, 0);
}

module.exports = {
  analyzeWithAI
};
