const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize the OpenAI client if API key is available
let openai;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (error) {
  console.warn('OpenAI initialization failed, using alternative analysis');
}

/**
 * Analyzes field data with OpenAI
 */
async function analyzeWithAI(fieldData, weatherData) {
  if (!openai) {
    return alternativeAnalysis(fieldData, weatherData);
  }
  
  try {
    const prompt = generatePrompt(fieldData, weatherData);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an expert agricultural analyst with deep knowledge of farming in Zimbabwe. Provide practical, actionable advice for farmers based on field and weather data." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return {
      success: true,
      analysis: completion.choices[0].message.content,
      source: "openai"
    };
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    // Fallback to alternative analysis if OpenAI fails
    return alternativeAnalysis(fieldData, weatherData);
  }
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
    summary: `Analysis for ${field_size}ha of ${crop_type} planted on ${planting_date}`,
    recommendations: [],
    risks: [],
    opportunities: []
  };
  
  // Weather analysis
  const weatherSummary = analyzeWeather(weatherData, crop_type);
  
  // Crop-specific analysis
  let cropAnalysis;
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
    default:
      cropAnalysis = generalCropAnalysis(fieldData, weatherData);
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
  if (cropType.toLowerCase() === 'maize') {
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
  }
  
  return summary;
}

/**
 * Crop-specific analysis function for maize
 */
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
  
  return analysis;
}

// Additional crop analysis functions would be implemented here
function analyzeWheat(fieldData, weatherData) {
  // Implementation for wheat analysis
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
  // Implementation for soybean analysis
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
  // Implementation for cotton analysis
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

/**
 * Generic analysis for other crops
 */
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

/**
 * Generate prompt for OpenAI analysis
 */
function generatePrompt(fieldData, weatherData) {
  return `
I need an agricultural analysis for a farmer in Zimbabwe with the following field details:

Field Information:
- Crop Type: ${fieldData.crop_type}
- Variety: ${fieldData.variety || 'Not specified'}
- Field Size: ${fieldData.field_size} hectares
- Soil Type: ${fieldData.soil_type || 'Not specified'}
- Planting Date: ${fieldData.planting_date}
- Current Growth Stage: ${fieldData.growth_stage || 'Not specified'}
- Location: Latitude ${fieldData.latitude}, Longitude ${fieldData.longitude}

Field Health:
- Pest Infestation: ${fieldData.pest_infestation || 'Not specified'}
- Pest Control Methods: ${fieldData.pest_control || 'Not specified'}
- Signs of Diseases: ${fieldData.signs_of_diseases || 'Not specified'}
- Weed Pressure: ${fieldData.weed_pressure || 'Not specified'}

Recent Weather Data:
${weatherData && weatherData.daily ? `
- Average Max Temperature: ${average(weatherData.daily.temperature_2m_max).toFixed(1)}°C
- Average Min Temperature: ${average(weatherData.daily.temperature_2m_min).toFixed(1)}°C
- Total Precipitation: ${sum(weatherData.daily.precipitation_sum).toFixed(1)}mm
` : 'Weather data unavailable'}

Please provide:
1. A brief analysis of the current field conditions
2. Specific recommendations for managing this crop at its current stage
3. Potential risks based on the weather and field conditions
4. Opportunities for optimizing yield and quality

Focus on practical, actionable advice specific to farming in Zimbabwe.
`;
}

// Helper functions
function average(arr) {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function sum(arr) {
  return arr.reduce((sum, val) => sum + val, 0);
}

module.exports = {
  analyzeWithAI
};
