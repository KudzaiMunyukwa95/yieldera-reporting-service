const axios = require('axios');
const moment = require('moment');

class WeatherService {
  constructor() {
    this.baseUrl = 'https://api.open-meteo.com/v1/forecast';
    this.historicalUrl = 'https://archive-api.open-meteo.com/v1/archive';
  }

  async getCurrentWeather(latitude, longitude) {
    try {
      const params = {
        latitude: latitude,
        longitude: longitude,
        current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max,sunrise,sunset',
        timezone: 'auto',
        forecast_days: 7
      };

      const response = await axios.get(this.baseUrl, { params });
      return this.formatCurrentWeather(response.data);
    } catch (error) {
      console.error('Error fetching current weather:', error);
      return this.getDefaultWeatherData();
    }
  }

  async getHistoricalWeather(latitude, longitude, daysBack = 14) {
    try {
      const endDate = moment().format('YYYY-MM-DD');
      const startDate = moment().subtract(daysBack, 'days').format('YYYY-MM-DD');

      const params = {
        latitude: latitude,
        longitude: longitude,
        start_date: startDate,
        end_date: endDate,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
        timezone: 'auto'
      };

      const response = await axios.get(this.historicalUrl, { params });
      return this.formatHistoricalWeather(response.data);
    } catch (error) {
      console.error('Error fetching historical weather:', error);
      return this.getDefaultHistoricalData();
    }
  }

  async getComprehensiveWeatherData(latitude, longitude) {
    try {
      const [current, historical] = await Promise.all([
        this.getCurrentWeather(latitude, longitude),
        this.getHistoricalWeather(latitude, longitude, 21) // 3 weeks of historical data
      ]);

      return {
        current,
        historical,
        analysis: this.analyzeWeatherPatterns(current, historical),
        agronomicInsights: this.getAgronomicInsights(current, historical)
      };
    } catch (error) {
      console.error('Error fetching comprehensive weather data:', error);
      return this.getDefaultComprehensiveData();
    }
  }

  formatCurrentWeather(data) {
    try {
      const current = data.current;
      const daily = data.daily;

      return {
        current: {
          temperature: current.temperature_2m,
          humidity: current.relative_humidity_2m,
          precipitation: current.precipitation,
          weatherCode: current.weather_code,
          windSpeed: current.wind_speed_10m,
          windDirection: current.wind_direction_10m,
          description: this.getWeatherDescription(current.weather_code)
        },
        forecast: daily.time.slice(0, 7).map((date, index) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          tempMax: daily.temperature_2m_max[index] ? Math.round(daily.temperature_2m_max[index]) : '-',
          tempMin: daily.temperature_2m_min[index] ? Math.round(daily.temperature_2m_min[index]) : '-',
          precipitation: daily.precipitation_sum[index] ? Math.round(daily.precipitation_sum[index] * 10) / 10 : '0',
          weatherCode: daily.weather_code[index],
          windSpeed: daily.wind_speed_10m_max[index] ? Math.round(daily.wind_speed_10m_max[index]) : '-',
          sunrise: daily.sunrise[index],
          sunset: daily.sunset[index],
          description: this.getWeatherDescription(daily.weather_code[index])
        }))
      };
    } catch (error) {
      console.error('Error formatting current weather:', error);
      return this.getDefaultWeatherData();
    }
  }

  formatHistoricalWeather(data) {
    try {
      const daily = data.daily;
      
      return daily.time.map((date, index) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tempMax: daily.temperature_2m_max[index] ? Math.round(daily.temperature_2m_max[index]) : '-',
        tempMin: daily.temperature_2m_min[index] ? Math.round(daily.temperature_2m_min[index]) : '-',
        precipitation: daily.precipitation_sum[index] ? Math.round(daily.precipitation_sum[index] * 10) / 10 : '0',
        weatherCode: daily.weather_code[index],
        description: this.getWeatherDescription(daily.weather_code[index])
      })).slice(-7); // Get last 7 days
    } catch (error) {
      console.error('Error formatting historical weather:', error);
      return this.getDefaultHistoricalData();
    }
  }

  analyzeWeatherPatterns(current, historical) {
    try {
      const recentDays = historical.slice(-7); // Last 7 days
      const totalPrecipitation = recentDays.reduce((sum, day) => sum + (day.precipitation || 0), 0);
      const avgMaxTemp = recentDays.reduce((sum, day) => sum + (day.tempMax || 0), 0) / recentDays.length;
      const avgMinTemp = recentDays.reduce((sum, day) => sum + (day.tempMin || 0), 0) / recentDays.length;
      
      const lowestTemp = Math.min(...recentDays.map(day => day.tempMin || 0));
      const highestTemp = Math.max(...recentDays.map(day => day.tempMax || 0));
      
      const dryDays = recentDays.filter(day => (day.precipitation || 0) < 1).length;
      const rainyDays = recentDays.filter(day => (day.precipitation || 0) >= 1).length;

      return {
        last7Days: {
          totalRainfall: Math.round(totalPrecipitation * 10) / 10,
          avgMaxTemp: Math.round(avgMaxTemp * 10) / 10,
          avgMinTemp: Math.round(avgMinTemp * 10) / 10,
          lowestTemp: Math.round(lowestTemp * 10) / 10,
          highestTemp: Math.round(highestTemp * 10) / 10,
          dryDays: dryDays,
          rainyDays: rainyDays
        },
        trends: {
          temperatureTrend: this.calculateTemperatureTrend(recentDays),
          precipitationTrend: this.calculatePrecipitationTrend(recentDays),
          riskFactors: this.identifyRiskFactors(current, recentDays)
        }
      };
    } catch (error) {
      console.error('Error analyzing weather patterns:', error);
      return { last7Days: {}, trends: {} };
    }
  }

  getAgronomicInsights(current, historical) {
    try {
      const analysis = this.analyzeWeatherPatterns(current, historical);
      const insights = [];

      // Temperature insights
      if (analysis.last7Days.lowestTemp < 5) {
        insights.push({
          type: 'warning',
          category: 'temperature',
          message: `Frost risk detected - minimum temperature dropped to ${analysis.last7Days.lowestTemp}°C. Consider protective measures for sensitive crops.`
        });
      }

      if (analysis.last7Days.highestTemp > 35) {
        insights.push({
          type: 'warning',
          category: 'temperature',
          message: `High temperature stress detected - maximum temperature reached ${analysis.last7Days.highestTemp}°C. Ensure adequate irrigation and consider heat stress mitigation.`
        });
      }

      // Rainfall insights
      if (analysis.last7Days.totalRainfall < 5) {
        insights.push({
          type: 'alert',
          category: 'water',
          message: `Low rainfall period detected (${analysis.last7Days.totalRainfall}mm in 7 days). Monitor soil moisture and consider supplemental irrigation.`
        });
      }

      if (analysis.last7Days.totalRainfall > 100) {
        insights.push({
          type: 'warning',
          category: 'water',
          message: `Excessive rainfall detected (${analysis.last7Days.totalRainfall}mm in 7 days). Monitor for waterlogging and disease pressure.`
        });
      }

      // Growing conditions
      if (analysis.last7Days.avgMaxTemp >= 20 && analysis.last7Days.avgMaxTemp <= 30 && analysis.last7Days.totalRainfall >= 10) {
        insights.push({
          type: 'positive',
          category: 'growth',
          message: 'Favorable growing conditions detected with adequate temperature and moisture levels.'
        });
      }

      return {
        insights: insights,
        recommendations: this.generateWeatherRecommendations(analysis, current)
      };
    } catch (error) {
      console.error('Error generating agronomic insights:', error);
      return { insights: [], recommendations: [] };
    }
  }

  generateWeatherRecommendations(analysis, current) {
    const recommendations = [];

    // Irrigation recommendations
    if (analysis.last7Days.totalRainfall < 10) {
      recommendations.push('Consider increasing irrigation frequency due to low recent rainfall');
    }

    // Disease management
    if (analysis.last7Days.totalRainfall > 50 && current.current.humidity > 80) {
      recommendations.push('High humidity and rainfall increase disease risk - monitor crops closely and consider preventive fungicide applications');
    }

    // Pest management
    if (analysis.last7Days.avgMaxTemp > 25 && analysis.last7Days.totalRainfall < 20) {
      recommendations.push('Warm, dry conditions may increase pest activity - monitor for insect infestations');
    }

    // Planting recommendations
    if (current.forecast && current.forecast.length > 0) {
      const upcoming3Days = current.forecast.slice(0, 3);
      const upcomingRain = upcoming3Days.reduce((sum, day) => sum + (day.precipitation || 0), 0);
      
      if (upcomingRain > 20) {
        recommendations.push('Good planting window ahead with expected rainfall in the next 3 days');
      }
    }

    return recommendations;
  }

  calculateTemperatureTrend(recentDays) {
    if (recentDays.length < 3) return 'stable';
    
    const firstHalf = recentDays.slice(0, Math.floor(recentDays.length / 2));
    const secondHalf = recentDays.slice(Math.floor(recentDays.length / 2));
    
    const avgFirst = firstHalf.reduce((sum, day) => sum + day.tempMax, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, day) => sum + day.tempMax, 0) / secondHalf.length;
    
    const difference = avgSecond - avgFirst;
    
    if (difference > 2) return 'increasing';
    if (difference < -2) return 'decreasing';
    return 'stable';
  }

  calculatePrecipitationTrend(recentDays) {
    const recentRain = recentDays.slice(-3).reduce((sum, day) => sum + (day.precipitation || 0), 0);
    const earlierRain = recentDays.slice(0, 3).reduce((sum, day) => sum + (day.precipitation || 0), 0);
    
    if (recentRain > earlierRain * 1.5) return 'increasing';
    if (recentRain < earlierRain * 0.5) return 'decreasing';
    return 'stable';
  }

  identifyRiskFactors(current, recentDays) {
    const risks = [];
    
    // Drought risk
    const totalRain = recentDays.reduce((sum, day) => sum + (day.precipitation || 0), 0);
    if (totalRain < 5) risks.push('drought');
    
    // Frost risk
    const minTemp = Math.min(...recentDays.map(day => day.tempMin || 0));
    if (minTemp < 5) risks.push('frost');
    
    // Heat stress
    const maxTemp = Math.max(...recentDays.map(day => day.tempMax || 0));
    if (maxTemp > 35) risks.push('heat_stress');
    
    // Disease pressure
    if (totalRain > 50 && current.current.humidity > 80) risks.push('disease_pressure');
    
    return risks;
  }

  getWeatherDescription(code) {
    const weatherCodes = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };
    
    return weatherCodes[code] || 'Unknown';
  }

  getDefaultWeatherData() {
    return {
      current: {
        temperature: null,
        humidity: null,
        precipitation: null,
        description: 'Weather data unavailable'
      },
      forecast: []
    };
  }

  getDefaultHistoricalData() {
    return [];
  }

  getDefaultComprehensiveData() {
    return {
      current: this.getDefaultWeatherData(),
      historical: this.getDefaultHistoricalData(),
      analysis: { last7Days: {}, trends: {} },
      agronomicInsights: { insights: [], recommendations: [] }
    };
  }
}

module.exports = WeatherService;
