const axios = require('axios');

/**
 * Fetches historical weather data for a specific location
 * Using the free Open-Meteo API (no API key required)
 */
async function getHistoricalWeather(latitude, longitude, startDate, endDate) {
  try {
    const response = await axios.get('https://archive-api.open-meteo.com/v1/archive', {
      params: {
        latitude,
        longitude,
        start_date: startDate,
        end_date: endDate,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,et0_fao_evapotranspiration',
        timezone: 'Africa/Harare' // Adjust for your region
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    throw new Error('Failed to fetch weather data');
  }
}

/**
 * Fetches seasonal forecast for a location
 */
async function getSeasonalForecast(latitude, longitude) {
  try {
    // Current date
    const currentDate = new Date();
    
    // Forecast for next 14 days
    const endDate = new Date();
    endDate.setDate(currentDate.getDate() + 14);
    
    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude,
        longitude,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
        timezone: 'Africa/Harare',
        forecast_days: 14
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching seasonal forecast:', error.message);
    throw new Error('Failed to fetch seasonal forecast');
  }
}

module.exports = {
  getHistoricalWeather,
  getSeasonalForecast
};
