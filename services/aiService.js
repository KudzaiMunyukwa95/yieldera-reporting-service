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
  // Pre-process data to extract/format important information
  const processedData = preprocessFieldData(fieldData);
  
  // Generate prompt for OpenAI
  const prompt = generateOpenAIPrompt(processedData, weatherData, forecastData);
  
  // Log the prompt for debugging (remove in production)
  // console.log("OpenAI Prompt:", prompt);
  
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert agricultural analyst specializing in Zimbabwe farming practices with deep knowledge of fertilizer requirements, pest management, and crop-specific recommendations. Your task is to generate a detailed agronomic report with practical, actionable recommendations based on field data and weather conditions. You will include specific risk scores and technical assessment of yield potential."
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
  
  // Get natural language field summary and weather summary
  const fieldSummary = await generateFieldSummary(processedData, weatherData);
  
  // Format the analysis as Markdown if not already
  let formattedAnalysis = analysis;
  if (!analysis.includes('#')) {
    formattedAnalysis = formatAnalysisToMarkdown(analysis);
  }

  // Get location details
  const locationData = await determineLocationFromCoordinates(fieldData.latitude, fieldData.longitude);

  return {
    success: true,
    analysis: formattedAnalysis,
    source: "openai",
    fieldSummary: fieldSummary.fieldSummary,
    weatherSummary: fieldSummary.weatherSummary,
    locationName: locationData.locationName,
    riskScore: calculateRiskScore(fieldData, weatherData)
  };
}

/**
 * Preprocess field data to extract and format important information
 */
function preprocessFieldData(fieldData) {
  const processed = {...fieldData};
  
  // Format planting date to human-readable format
  if (fieldData.planting_date) {
    try {
      const date = new Date(fieldData.planting_date);
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      processed.formatted_planting_date = date.toLocaleDateString('en-GB', options);
      
      // Calculate days since planting
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - date);
      processed.days_since_planting = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch (error) {
      console.log("Error formatting planting date:", error.message);
    }
  }
  
  // Interpret fertilizer information
  processed.fertilizer_analysis = interpretFertilizer(
    fieldData.basal_fertilizer, 
    fieldData.basal_fertilizer_amount,
    fieldData.top_dressing,
    fieldData.top_dressing_amount,
    fieldData.crop_type
  );
  
  // Calculate yield comparison
  if (fieldData.last_yield && fieldData.last_yield_unit) {
    processed.yield_comparison = analyzeYieldPotential(
      fieldData.crop_type,
      fieldData.last_yield,
      fieldData.last_yield_unit,
      fieldData.field_size
    );
  }
  
  // Calculate loss area ratio
  if (fieldData.last_loss_area && fieldData.field_size) {
    const lossAreaHa = parseFloat(fieldData.last_loss_area) || 0;
    const fieldSizeHa = parseFloat(fieldData.field_size) || 1;
    processed.loss_area_ratio = (lossAreaHa / fieldSizeHa * 100).toFixed(1);
  }
  
  return processed;
}

/**
 * Interpret fertilizer information in relation to crop requirements
 */
function interpretFertilizer(basalType, basalAmount, topType, topAmount, cropType) {
  // Standardize fertilizer types (handle shorthand notation)
  const standardizeType = (type) => {
    if (!type) return "Unknown";
    
    // Convert to lowercase for case-insensitive matching
    const lcType = type.toLowerCase();
    
    // Handle common shorthand notations
    if (lcType === "d" || lcType === "compound d") return "Compound D";
    if (lcType === "c" || lcType === "compound c") return "Compound C";
    if (lcType === "a" || lcType === "compound a") return "Compound A";
    if (lcType === "l" || lcType === "compound l") return "Compound L";
    if (lcType === "j" || lcType === "compound j") return "Compound J";
    if (lcType === "an" || lcType === "ammonium nitrate") return "Ammonium Nitrate";
    if (lcType === "urea") return "Urea";
    
    // If not recognized, return the original
    return type;
  };
  
  // Convert amounts to numbers if possible
  const parseAmount = (amount) => {
    if (!amount) return 0;
    const numericAmount = parseFloat(amount);
    return isNaN(numericAmount) ? 0 : numericAmount;
  };
  
  const basalFertilizer = standardizeType(basalType);
  const basalFertilizerAmount = parseAmount(basalAmount);
  const topFertilizer = standardizeType(topType);
  const topFertilizerAmount = parseAmount(topAmount);
  
  // Crop-specific fertilizer recommendations (simplified)
  const recommendations = {
    maize: {
      basal: {
        "Compound D": 200, // kg/ha
        "NPK 7:14:7": 250,
        "Compound C": 250
      },
      top: {
        "Ammonium Nitrate": 150,
        "Urea": 100
      }
    },
    tobacco: {
      basal: {
        "Compound C": 300,
        "Compound L": 400
      },
      top: {
        "Ammonium Nitrate": 150,
        "Compound S": 200
      }
    },
    cotton: {
      basal: {
        "Compound L": 250,
        "Compound D": 200
      },
      top: {
        "Ammonium Nitrate": 100,
        "Urea": 75
      }
    },
    // Default for other crops
    default: {
      basal: {
        "Compound D": 200
      },
      top: {
        "Ammonium Nitrate": 100
      }
    }
  };
  
  // Get appropriate recommendations for the crop type
  const cropRecs = recommendations[cropType?.toLowerCase()] || recommendations.default;
  
  // Check basal fertilizer adequacy
  let basalAdequacy = "Unknown";
  if (basalFertilizerAmount > 0 && basalFertilizer in cropRecs.basal) {
    const recommended = cropRecs.basal[basalFertilizer];
    if (basalFertilizerAmount >= recommended * 0.9) {
      basalAdequacy = "Adequate";
    } else if (basalFertilizerAmount >= recommended * 0.6) {
      basalAdequacy = "Somewhat inadequate";
    } else {
      basalAdequacy = "Inadequate";
    }
  }
  
  // Check top dressing adequacy
  let topAdequacy = "Unknown";
  if (topFertilizerAmount > 0 && topFertilizer in cropRecs.top) {
    const recommended = cropRecs.top[topFertilizer];
    if (topFertilizerAmount >= recommended * 0.9) {
      topAdequacy = "Adequate";
    } else if (topFertilizerAmount >= recommended * 0.6) {
      topAdequacy = "Somewhat inadequate";
    } else {
      topAdequacy = "Inadequate";
    }
  }
  
  return {
    basalFertilizer,
    basalFertilizerAmount,
    basalAdequacy,
    topFertilizer,
    topFertilizerAmount,
    topAdequacy
  };
}

/**
 * Analyze yield potential compared to last season
 */
function analyzeYieldPotential(cropType, lastYield, lastYieldUnit, fieldSize) {
  // Convert everything to consistent units (tons/ha)
  const yieldValue = parseFloat(lastYield) || 0;
  const fieldSizeHa = parseFloat(fieldSize) || 1;
  
  // Convert yield to tons/ha for comparison
  let yieldTonsPerHa = 0;
  const unit = lastYieldUnit?.toLowerCase() || "";
  
  if (unit.includes("ton") || unit.includes("t/ha")) {
    yieldTonsPerHa = yieldValue;
  } else if (unit.includes("kg/ha")) {
    yieldTonsPerHa = yieldValue / 1000;
  } else if (unit.includes("bag")) {
    // Estimate: 1 bag ~= 50kg for maize
    yieldTonsPerHa = (yieldValue * 50) / 1000;
  } else {
    // Assume total tons if no unit specified
    yieldTonsPerHa = yieldValue / fieldSizeHa;
  }
  
  // Average yield benchmarks for Zimbabwe crops (tons/ha)
  const avgYields = {
    maize: 0.8,
    tobacco: 1.5,
    cotton: 0.6,
    wheat: 4.5,
    soybean: 1.8,
    groundnut: 0.7,
    sunflower: 0.5,
    sorghum: 0.7,
    default: 1.0
  };
  
  const goodYields = {
    maize: 4.0,
    tobacco: 3.0,
    cotton: 1.2,
    wheat: 6.0,
    soybean: 2.5,
    groundnut: 1.2,
    sunflower: 0.8,
    sorghum: 1.5,
    default: 2.0
  };
  
  const cropLower = cropType?.toLowerCase() || "default";
  const averageYield = avgYields[cropLower] || avgYields.default;
  const goodYield = goodYields[cropLower] || goodYields.default;
  
  // Calculate relative performance
  const vsAverage = (yieldTonsPerHa / averageYield).toFixed(2);
  const vsGood = (yieldTonsPerHa / goodYield).toFixed(2);
  
  return {
    lastYieldTonsPerHa: yieldTonsPerHa.toFixed(2),
    averageYield: averageYield.toFixed(2),
    goodYield: goodYield.toFixed(2),
    vsAverageRatio: vsAverage,
    vsGoodRatio: vsGood,
    performance: vsAverage >= 1.2 ? "Above average" : (vsAverage >= 0.8 ? "Average" : "Below average")
  };
}

/**
 * Calculate risk score based on multiple factors
 */
function calculateRiskScore(fieldData, weatherData) {
  let riskScore = 50; // Start at medium risk
  let riskFactors = [];
  
  // Pest infestation risk (0-20 points)
  if (fieldData.pest_infestation?.toLowerCase() === 'yes') {
    riskScore += 15;
    riskFactors.push("Pest infestation present (+15)");
  } else if (fieldData.pest_control?.toLowerCase() === 'no' || !fieldData.pest_control) {
    riskScore += 5;
    riskFactors.push("No pest control measures (+5)");
  }
  
  // Disease risk (0-15 points)
  if (fieldData.signs_of_diseases?.toLowerCase() === 'yes') {
    riskScore += 15;
    riskFactors.push("Disease symptoms present (+15)");
  }
  
  // Weed pressure risk (0-10 points)
  if (fieldData.weed_pressure?.toLowerCase() === 'high') {
    riskScore += 10;
    riskFactors.push("High weed pressure (+10)");
  } else if (fieldData.weed_pressure?.toLowerCase() === 'medium') {
    riskScore += 5;
    riskFactors.push("Medium weed pressure (+5)");
  }
  
  // Backup power risk (0-10 points)
  if (fieldData.backup_power?.toLowerCase() === 'no' || !fieldData.backup_power) {
    riskScore += 10;
    riskFactors.push("No backup power for irrigation (+10)");
  }
  
  // Fire guard risk (0-10 points)
  if (fieldData.fire_guard?.toLowerCase() === 'no' || !fieldData.fire_guard) {
    riskScore += 10;
    riskFactors.push("No fire guard established (+10)");
  }
  
  // Previous loss risk (0-10 points)
  if (fieldData.last_loss_area && fieldData.field_size) {
    const lossAreaHa = parseFloat(fieldData.last_loss_area) || 0;
    const fieldSizeHa = parseFloat(fieldData.field_size) || 1;
    const lossRatio = lossAreaHa / fieldSizeHa;
    
    if (lossRatio > 0.3) {
      riskScore += 10;
      riskFactors.push("Significant loss area from last season (+10)");
    } else if (lossRatio > 0.1) {
      riskScore += 5;
      riskFactors.push("Moderate loss area from last season (+5)");
    }
  }
  
  // Weather risk (0-15 points)
  if (weatherData && weatherData.daily) {
    try {
      const totalRain = weatherData.daily.precipitation_sum.reduce((sum, rain) => sum + rain, 0);
      
      // Drought risk
      if (totalRain < 20) {
        riskScore += 15;
        riskFactors.push("Low rainfall in the past 30 days (+15)");
      } else if (totalRain < 50) {
        riskScore += 8;
        riskFactors.push("Below average rainfall in the past 30 days (+8)");
      }
      
      // Excessive rain risk
      if (totalRain > 200) {
        riskScore += 10;
        riskFactors.push("Excessive rainfall in the past 30 days (+10)");
      }
    } catch (error) {
      console.log("Error calculating weather risk:", error.message);
    }
  }
  
  // Cap the risk score at 100
  riskScore = Math.min(riskScore, 100);
  
  // Determine risk category
  let riskCategory;
  if (riskScore >= 80) {
    riskCategory = "Very High";
  } else if (riskScore >= 60) {
    riskCategory = "High";
  } else if (riskScore >= 40) {
    riskCategory = "Medium";
  } else if (riskScore >= 20) {
    riskCategory = "Low";
  } else {
    riskCategory = "Very Low";
  }
  
  return {
    score: riskScore,
    category: riskCategory,
    factors: riskFactors
  };
}

/**
 * Generate natural language field summary using OpenAI
 */
async function generateFieldSummary(fieldData, weatherData) {
  try {
    // Calculate weather statistics
    let weatherStats = {};
    if (weatherData && weatherData.daily) {
      try {
        const temps = weatherData.daily.temperature_2m_max;
        weatherStats.avgMaxTemp = average(temps).toFixed(1);
        weatherStats.avgMinTemp = average(weatherData.daily.temperature_2m_min).toFixed(1);
        weatherStats.totalRain = sum(weatherData.daily.precipitation_sum).toFixed(1);
        weatherStats.minTemp = Math.min(...weatherData.daily.temperature_2m_min).toFixed(1);
        weatherStats.maxTemp = Math.max(...weatherData.daily.temperature_2m_max).toFixed(1);
      } catch (error) {
        console.log("Error calculating weather stats:", error.message);
      }
    }

    // Get location data
    const locationData = await determineLocationFromCoordinates(fieldData.latitude, fieldData.longitude);

    const summaryPrompt = `
Generate a concise, one-paragraph natural language summary (3-4 sentences) of the following agricultural field. Be specific and technical, not generic. Focus on data-based insights, not assumptions about farmer care.

Field name: ${fieldData.farm_name || 'Unnamed field'}
Crop type: ${fieldData.crop_type || 'Unknown crop'}
Variety: ${fieldData.variety || 'Unknown variety'}
Field size: ${fieldData.field_size || 'Unknown'} hectares
Planting date: ${fieldData.formatted_planting_date || fieldData.planting_date || 'Unknown date'}
Current growth stage: ${fieldData.growth_stage || 'Unknown'}
Days since planting: ${fieldData.days_since_planting || 'Unknown'}
Soil type: ${fieldData.soil_type || 'Unknown soil type'}
Farmer: ${fieldData.farmer_name || 'Unknown farmer'}
Location: ${locationData.district}, ${locationData.province}, Zimbabwe (based on coordinates: Latitude ${fieldData.latitude || 'Unknown'}, Longitude ${fieldData.longitude || 'Unknown'})

Last season yield: ${fieldData.last_yield || 'Unknown'} ${fieldData.last_yield_unit || ''}
Last season loss area: ${fieldData.last_loss_area || 'Unknown'} hectares
Last season loss cause: ${fieldData.last_loss_cause || 'Unknown'}

Fertilizer analysis:
- Basal fertilizer: ${fieldData.fertilizer_analysis.basalFertilizer} (${fieldData.fertilizer_analysis.basalFertilizerAmount} kg/ha) - Adequacy: ${fieldData.fertilizer_analysis.basalAdequacy}
- Top dressing: ${fieldData.fertilizer_analysis.topFertilizer} (${fieldData.fertilizer_analysis.topFertilizerAmount} kg/ha) - Adequacy: ${fieldData.fertilizer_analysis.topAdequacy}

Make the summary sound technical and precise, not generic. Mention the specific location (district and province) and the exact farming region of Zimbabwe. DO NOT use generic statements like "under the care of farmer [name]" or "in a sandy soil area."

Then, in a separate paragraph, create a weather summary for the field that includes these specific metrics:
- Total rainfall in the past 30 days: ${weatherStats.totalRain || 'Unknown'} mm
- Temperature range in the past 30 days: ${weatherStats.minTemp || 'Unknown'}°C to ${weatherStats.maxTemp || 'Unknown'}°C
- Average daily max temperature: ${weatherStats.avgMaxTemp || 'Unknown'}°C
- Average daily min temperature: ${weatherStats.avgMinTemp || 'Unknown'}°C

Overall Risk Score: ${fieldData.riskScore?.score || 'Unknown'}/100 (${fieldData.riskScore?.category || 'Unknown'} risk)
Risk Factors: ${fieldData.riskScore?.factors?.join(', ') || 'Unknown'}
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an agricultural expert specializing in Zimbabwe farming regions and practices. Provide precise, technical information based on the data provided without making assumptions or using generic statements."
          },
          {
            role: "user",
            content: summaryPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      },
      {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Extract the response content and split paragraphs
    const fullSummary = response.data.choices[0].message.content.trim();
    const paragraphs = fullSummary.split('\n\n');
    
    return {
      fieldSummary: paragraphs[0] || '',
      weatherSummary: paragraphs[1] || ''
    };
  } catch (error) {
    console.error("Error generating field summary:", error);
    return {
      fieldSummary: `This report covers a ${fieldData.field_size || 'N/A'} hectare ${fieldData.crop_type || 'crop'} field${fieldData.variety ? ' (variety: ' + fieldData.variety + ')' : ''} in ${fieldData.locationName || 'Zimbabwe'}.`,
      weatherSummary: ''
    };
  }
}

/**
 * Determine location name from coordinates
 */
async function determineLocationFromCoordinates(latitude, longitude) {
  if (!latitude || !longitude) {
    return {
      locationName: 'Unknown location in Zimbabwe',
      district: 'Unknown district',
      province: 'Unknown province'
    };
  }
  
  try {
    // Try to get location name from OpenAI based on coordinates
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert on Zimbabwe geography with precise knowledge of districts and provinces."
          },
          {
            role: "user",
            content: `Based on these coordinates in Zimbabwe: Latitude ${latitude}, Longitude ${longitude}, provide the exact district and province where this location is found. Return your answer in JSON format with keys: district, province, locationName (which combines district and province with comma separation).`
          }
        ],
        temperature: 0.3,
        max_tokens: 150
      },
      {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    try {
      // Try to parse JSON response
      const locationText = response.data.choices[0].message.content.trim();
      
      // Extract JSON from the response if not already in proper format
      let jsonStr = locationText;
      if (locationText.includes('{') && locationText.includes('}')) {
        jsonStr = locationText.substring(
          locationText.indexOf('{'),
          locationText.lastIndexOf('}') + 1
        );
      }
      
      const locationData = JSON.parse(jsonStr);
      
      // Ensure all required fields exist
      if (!locationData.locationName && locationData.district && locationData.province) {
        locationData.locationName = `${locationData.district}, ${locationData.province}`;
      }
      
      return {
        locationName: locationData.locationName || 'Unknown location',
        district: locationData.district || 'Unknown district',
        province: locationData.province || 'Unknown province'
      };
    } catch (parseError) {
      console.error("Error parsing location data:", parseError);
      
      // If JSON parsing fails, use text as is
      const locationText = response.data.choices[0].message.content.trim();
      return {
        locationName: locationText,
        district: 'Unable to determine district',
        province: 'Unable to determine province'
      };
    }
  } catch (error) {
    console.error("Error determining location from coordinates:", error);
    return {
      locationName: 'Unknown location in Zimbabwe',
      district: 'Unknown district',
      province: 'Unknown province'
    };
  }
}

/**
 * Generate detailed prompt for OpenAI
 */
function generateOpenAIPrompt(fieldData, weatherData, forecastData) {
  // Determine Zimbabwe's natural farming region based on coordinates
  const farmingRegion = determineZimbabweFarmingRegion(fieldData.latitude, fieldData.longitude);
  
  // Format weather summary
  let weatherSummary = "Weather data unavailable.";
  let weatherForecast = "Forecast unavailable.";
  let weatherStats = {};
  
  if (weatherData && weatherData.daily) {
    try {
      const temps = weatherData.daily.temperature_2m_max;
      weatherStats.avgMaxTemp = average(temps).toFixed(1);
      weatherStats.avgMinTemp = average(weatherData.daily.temperature_2m_min).toFixed(1);
      weatherStats.totalRain = sum(weatherData.daily.precipitation_sum).toFixed(1);
      weatherStats.minTemp = Math.min(...weatherData.daily.temperature_2m_min).toFixed(1);
      weatherStats.maxTemp = Math.max(...weatherData.daily.temperature_2m_max).toFixed(1);
      
      weatherSummary = `Last 30 days: Avg max temp: ${weatherStats.avgMaxTemp}°C, Avg min temp: ${weatherStats.avgMinTemp}°C, Total rainfall: ${weatherStats.totalRain}mm, Temperature range: ${weatherStats.minTemp}°C to ${weatherStats.maxTemp}°C.`;
      
      // Check for extreme conditions
      if (weatherStats.avgMaxTemp > 32) {
        weatherSummary += " Temperatures have been unusually high.";
      } else if (weatherStats.avgMaxTemp < 15) {
        weatherSummary += " Temperatures have been unusually low.";
      }
      
      if (weatherStats.totalRain < 10) {
        weatherSummary += " Rainfall has been significantly below normal.";
      } else if (weatherStats.totalRain > 150) {
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
  
  // Yield comparison
  const yieldComparison = fieldData.yield_comparison ? 
    `Last season's yield was ${fieldData.yield_comparison.lastYieldTonsPerHa} tons/ha, which is ${fieldData.yield_comparison.performance} (${fieldData.yield_comparison.vsAverageRatio}x the average yield of ${fieldData.yield_comparison.averageYield} tons/ha for ${fieldData.crop_type} in Zimbabwe).` : 
    'No yield data available for comparison.';
  
  // Loss area analysis
  const lossAreaAnalysis = fieldData.loss_area_ratio ?
    `Last season experienced a loss in ${fieldData.loss_area_ratio}% of the planted area, attributed to ${fieldData.last_loss_cause || 'unknown causes'}.` :
    'No loss area data available for analysis.';
  
  // Risk score
  const riskScore = fieldData.riskScore ?
    `Overall Risk Score: ${fieldData.riskScore.score}/100 (${fieldData.riskScore.category} risk).
Risk Factors: ${fieldData.riskScore.factors.join(', ')}.` :
    'Risk assessment not available.';
  
  return `
Please generate a detailed agricultural report for a farmer in Zimbabwe. The report should include precise analysis of field conditions, fertilizer adequacy, weather impacts, and specific recommendations tailored to the crop, growth stage, and location. Include numerical risk assessments and yield projections based on current data compared to historical performance.

## Field Information:
- Crop Type: ${fieldData.crop_type || 'Not specified'}
- Variety: ${fieldData.variety || 'Not specified'}
- Field Size: ${fieldData.field_size || 'Not specified'} hectares
- Soil Type: ${fieldData.soil_type || 'Not specified'}
- Planting Date: ${fieldData.formatted_planting_date || fieldData.planting_date || 'Not specified'} (${fieldData.days_since_planting || 'unknown'} days ago)
- Current Growth Stage: ${fieldData.growth_stage || 'Not specified'}
- Farm Location: ${farmingRegion.region} (${farmingRegion.description})
- GPS Coordinates: Latitude ${fieldData.latitude || 'Not specified'}, Longitude ${fieldData.longitude || 'Not specified'}

## Field Management:
- Irrigation Type: ${fieldData.irrigation_type || 'Not specified'}
- Basal Fertilizer: ${fieldData.fertilizer_analysis.basalFertilizer} (${fieldData.fertilizer_analysis.basalFertilizerAmount} kg/ha) - Adequacy: ${fieldData.fertilizer_analysis.basalAdequacy}
- Top Dressing: ${fieldData.fertilizer_analysis.topFertilizer} (${fieldData.fertilizer_analysis.topFertilizerAmount} kg/ha) - Adequacy: ${fieldData.fertilizer_analysis.topAdequacy}
- Last Yield: ${fieldData.last_yield || 'Not specified'} ${fieldData.last_yield_unit || ''}
- Yield Comparison: ${yieldComparison}
- Loss Area Analysis: ${lossAreaAnalysis}
- Backup Power Available: ${fieldData.backup_power || 'Not specified'}
- Fire Guard Established: ${fieldData.fire_guard || 'Not specified'}

## Field Health:
- Pest Infestation: ${fieldData.pest_infestation || 'Not specified'}
- Pest Control Methods: ${fieldData.pest_control || 'Not specified'}
- Signs of Diseases: ${fieldData.signs_of_diseases || 'Not specified'} 
- Weed Pressure: ${fieldData.weed_pressure || 'Not specified'}
- Risk Assessment: ${riskScore}

## Weather Conditions:
- Historical Weather: ${weatherSummary}
- Weather Forecast: ${weatherForecast}

Based on this information, please provide:

1. A concise analysis of current field conditions and crop suitability for this specific farming region and district
2. Detailed evaluation of fertilizer adequacy for this specific crop at its current growth stage
3. Crop-specific pest and weed control recommendations tailored to this growth stage and location
4. Numerical risk assessment (score out of 100) with breakdown of risk factors
5. Yield potential calculation compared to last season's results and typical yields for this crop in Zimbabwe
6. Specific recommendations for backup power requirements for irrigation (if not available)
7. Fire risk management recommendations (if fire guard not established)

Focus on precise, technical, crop-specific advice for Zimbabwe's agricultural conditions. Include specific expected outcomes with quantifiable metrics where possible.
`;
}

// The rest of the utility functions remain largely the same, but I'll keep them here for completeness

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
 */
function alternativeAnalysis(fieldData, weatherData) {
  // Rest of the original alternativeAnalysis function...
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
  
  // Calculate risk score
  const riskScore = calculateRiskScore(fieldData, weatherData);
  
  // Process field data
  const processedData = preprocessFieldData(fieldData);
  
  // Combine analyses
  return {
    success: true,
    analysis: formatAnalysis({
      ...analysis,
      weather: weatherSummary,
      ...cropAnalysis
    }),
    source: "rule-based",
    fieldSummary: `This report covers a ${field_size || 'N/A'} hectare ${crop_type || 'crop'} field${fieldData.variety ? ' (variety: ' + fieldData.variety + ')' : ''} in Zimbabwe.`,
    weatherSummary: weatherSummary,
    riskScore: riskScore
  };
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

// Crop-specific analysis functions remain unchanged

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
 * Helper function to analyze weather data
 */
function analyzeWeather(weatherData, cropType) {
  if (!weatherData || !weatherData.daily) {
    return "Weather data unavailable. Please check local forecasts.";
  }
  
  // Detailed weather analysis
  const temps = weatherData.daily.temperature_2m_max;
  const avgTemp = temps.reduce((sum, temp) => sum + temp, 0) / temps.length;
  const totalRain = weatherData.daily.precipitation_sum.reduce((sum, rain) => sum + rain, 0);
  const minTemp = Math.min(...weatherData.daily.temperature_2m_min);
  const maxTemp = Math.max(...weatherData.daily.temperature_2m_max);
  
  let summary = `Over the past 30 days, the field received ${totalRain.toFixed(1)}mm of rainfall, with temperatures ranging from ${minTemp.toFixed(1)}°C to ${maxTemp.toFixed(1)}°C (average: ${avgTemp.toFixed(1)}°C). `;
  
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

module.exports = {
  analyzeWithAI
};
