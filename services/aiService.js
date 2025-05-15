const axios = require('axios');
require('dotenv').config();

// Initialize Hugging Face client if API key is available
let huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;

/**
 * Analyzes field data with AI
 */
async function analyzeWithAI(fieldData, weatherData) {
  // Try multiple AI approaches in sequence
  try {
    // First attempt: Try Hugging Face Mistral model
    if (huggingFaceApiKey) {
      try {
        console.log("Attempting analysis with Hugging Face Mistral...");
        return await analyzeMistral(fieldData, weatherData);
      } catch (error) {
        console.log("Mistral analysis failed, trying alternative model...");
        // If Mistral fails, try another model
        try {
          return await analyzeAlternativeModel(fieldData, weatherData);
        } catch (alternativeError) {
          console.log("Alternative model failed, falling back to rule-based...");
          throw new Error("AI models unavailable");
        }
      }
    } else {
      console.log("No Hugging Face API key found, using rule-based analysis");
      return alternativeAnalysis(fieldData, weatherData);
    }
  } catch (error) {
    console.log("All AI approaches failed, using rule-based analysis");
    return alternativeAnalysis(fieldData, weatherData);
  }
}

/**
 * Analyze using Mistral model
 */
async function analyzeMistral(fieldData, weatherData) {
  const prompt = generatePrompt(fieldData, weatherData);
  
  // Format prompt for Mistral model
  const formattedPrompt = `<s>[INST] You are an expert agricultural analyst with deep knowledge of farming in Zimbabwe. Provide practical, actionable advice for farmers based on the following field and weather data:

${prompt}

Please provide:
1. A brief analysis of the current field conditions
2. Specific recommendations for managing this crop at its current stage
3. Potential risks based on the weather and field conditions
4. Opportunities for optimizing yield and quality

Focus on practical, actionable advice specific to farming in Zimbabwe. [/INST]</s>`;
  
  const response = await axios.post(
    "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
    {
      inputs: formattedPrompt,
      parameters: {
        max_new_tokens: 1024,
        temperature: 0.7,
        return_full_text: false
      }
    },
    {
      headers: {
        "Authorization": `Bearer ${huggingFaceApiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  // Extract the generated text
  let analysis = '';
  if (response.data && Array.isArray(response.data)) {
    analysis = response.data[0].generated_text;
  } else if (response.data && response.data.generated_text) {
    analysis = response.data.generated_text;
  } else {
    throw new Error('Unexpected response format from Hugging Face API');
  }

  // Format the analysis into Markdown sections if it's not already
  if (!analysis.includes('#') && !analysis.includes('###')) {
    analysis = formatAnalysisToMarkdown(analysis);
  }

  return {
    success: true,
    analysis: analysis,
    source: "huggingface-mistral"
  };
}

/**
 * Analyze using an alternative model (different endpoint)
 */
async function analyzeAlternativeModel(fieldData, weatherData) {
  const prompt = generatePrompt(fieldData, weatherData);
  
  // Try a different model - Llama 2 is more widely available
  const formattedPrompt = `<s>[INST] You are an agricultural expert specializing in farming in Zimbabwe. 
Based on the following field and weather data, provide useful advice for the farmer:

${prompt}

Include: 
- Current field condition analysis
- Crop management recommendations
- Potential risks
- Yield optimization tips
[/INST]</s>`;

  const response = await axios.post(
    "https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf",
    {
      inputs: formattedPrompt,
      parameters: {
        max_new_tokens: 1024,
        temperature: 0.7,
        return_full_text: false
      }
    },
    {
      headers: {
        "Authorization": `Bearer ${huggingFaceApiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  // Extract the generated text
  let analysis = '';
  if (response.data && Array.isArray(response.data)) {
    analysis = response.data[0].generated_text;
  } else if (response.data && response.data.generated_text) {
    analysis = response.data.generated_text;
  } else {
    throw new Error('Unexpected response format from Hugging Face API');
  }

  // Format the analysis into Markdown sections
  if (!analysis.includes('#') && !analysis.includes('###')) {
    analysis = formatAnalysisToMarkdown(analysis);
  }

  return {
    success: true,
    analysis: analysis,
    source: "huggingface-llama"
  };
}

/**
 * Format plain text analysis to Markdown
 */
function formatAnalysisToMarkdown(text) {
  // Split by new lines and look for sections
  const lines = text.split('\n');
  let formatted = `## Field Analysis\n\n`;
  
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
 * Alternative analysis when Hugging Face is unavailable
 * Uses rule-based analysis for common crops
 */
function alternativeAnalysis(fieldData, weatherData) {
  // Extract relevant data
  const { crop_type, soil_type, planting_date, field_size } = fieldData;
  
  // Create analysis object
  const analysis = {
    summary: `Analysis for ${field_size}ha of ${crop_type || 'crops'} planted on ${planting_date || 'unknown date'}`,
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

/**
 * Crop-specific analysis function for wheat
 */
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

/**
 * Crop-specific analysis function for soybean
 */
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

/**
 * Crop-specific analysis function for cotton
 */
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

/**
 * Crop-specific analysis function for tobacco
 */
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

/**
 * Crop-specific analysis function for groundnuts
 */
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

/**
 * Crop-specific analysis function for sunflower
 */
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

/**
 * Crop-specific analysis function for sorghum
 */
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
 * Generate prompt for Hugging Face analysis
 */
function generatePrompt(fieldData, weatherData) {
  return `
Field Information:
- Crop Type: ${fieldData.crop_type || 'Not specified'}
- Variety: ${fieldData.variety || 'Not specified'}
- Field Size: ${fieldData.field_size || 'Not specified'} hectares
- Soil Type: ${fieldData.soil_type || 'Not specified'}
- Planting Date: ${fieldData.planting_date || 'Not specified'}
- Current Growth Stage: ${fieldData.growth_stage || 'Not specified'}
- Location: Latitude ${fieldData.latitude || 'Not specified'}, Longitude ${fieldData.longitude || 'Not specified'}

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
`;
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
