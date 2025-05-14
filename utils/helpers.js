/**
 * Utility functions for the application
 */

/**
 * Format date to YYYY-MM-DD format
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate days between two dates
 */
function daysBetween(startDate, endDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((startDate - endDate) / millisecondsPerDay));
}

/**
 * Get crop season length in days
 */
function getCropSeasonLength(cropType) {
  const cropSeasons = {
    'maize': 120,
    'wheat': 100,
    'soybean': 110,
    'cotton': 160,
    'tobacco': 150,
    'groundnut': 130,
    'sunflower': 100,
    'sorghum': 120
  };
  
  return cropSeasons[cropType.toLowerCase()] || 120; // Default to 120 days
}

/**
 * Calculate growth stage based on planting date and crop type
 */
function calculateGrowthStage(plantingDate, cropType) {
  const today = new Date();
  const plantDate = new Date(plantingDate);
  const daysSincePlanting = daysBetween(plantDate, today);
  const seasonLength = getCropSeasonLength(cropType);
  
  const percentComplete = (daysSincePlanting / seasonLength) * 100;
  
  if (percentComplete < 20) {
    return 'Early Vegetative';
  } else if (percentComplete < 40) {
    return 'Vegetative';
  } else if (percentComplete < 60) {
    return 'Reproductive';
  } else if (percentComplete < 80) {
    return 'Grain Filling';
  } else if (percentComplete < 95) {
    return 'Maturity';
  } else {
    return 'Harvest Ready';
  }
}

/**
 * Safely parse JSON with error handling
 */
function safeJsonParse(data, fallback = {}) {
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return fallback;
  }
}

module.exports = {
  formatDate,
  daysBetween,
  getCropSeasonLength,
  calculateGrowthStage,
  safeJsonParse
};
