import { getOrganizationBySlug } from '../../../../lib/organizations';
import { getOrgData, ORG_KEY_SUFFIXES } from '../../../../lib/kv';

// Default settings
function getDefaultSettings(timezone = 'Africa/Lagos') {
  return {
    gameInfo: {
      enabled: false,
      gameDay: 0,
      startHour: 17,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      location: {
        enabled: false,
        name: '',
        address: '',
        googleMapsUrl: '',
      },
      weather: {
        enabled: false,
      },
    }
  };
}

// Geocode address to lat/lng using Nominatim (free, no API key)
async function geocodeAddress(address) {
  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'User-Agent': 'PlayDay-RSVP/1.0'
        }
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// Get weather from Open-Meteo (free, no API key)
async function getWeatherForecast(lat, lng, timezone) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weathercode,precipitation_probability&timezone=${encodeURIComponent(timezone)}&forecast_days=7`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

// Weather code to description and icon
function getWeatherInfo(code) {
  const weatherCodes = {
    0: { description: 'Clear sky', icon: '☀️' },
    1: { description: 'Mainly clear', icon: '🌤️' },
    2: { description: 'Partly cloudy', icon: '⛅' },
    3: { description: 'Overcast', icon: '☁️' },
    45: { description: 'Foggy', icon: '🌫️' },
    48: { description: 'Depositing rime fog', icon: '🌫️' },
    51: { description: 'Light drizzle', icon: '🌧️' },
    53: { description: 'Moderate drizzle', icon: '🌧️' },
    55: { description: 'Dense drizzle', icon: '🌧️' },
    61: { description: 'Slight rain', icon: '🌧️' },
    63: { description: 'Moderate rain', icon: '🌧️' },
    65: { description: 'Heavy rain', icon: '🌧️' },
    66: { description: 'Light freezing rain', icon: '🌨️' },
    67: { description: 'Heavy freezing rain', icon: '🌨️' },
    71: { description: 'Slight snow', icon: '❄️' },
    73: { description: 'Moderate snow', icon: '❄️' },
    75: { description: 'Heavy snow', icon: '❄️' },
    80: { description: 'Slight rain showers', icon: '🌦️' },
    81: { description: 'Moderate rain showers', icon: '🌦️' },
    82: { description: 'Violent rain showers', icon: '⛈️' },
    95: { description: 'Thunderstorm', icon: '⛈️' },
    96: { description: 'Thunderstorm with hail', icon: '⛈️' },
    99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
  };

  return weatherCodes[code] || { description: 'Unknown', icon: '🌡️' };
}

// Find the next game day date
function getNextGameDate(gameDay, timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDay = localTime.getDay();

  let daysUntil = gameDay - currentDay;
  if (daysUntil < 0) {
    daysUntil += 7;
  }
  // If it's game day but past the game time, show next week
  if (daysUntil === 0) {
    // We'll include today's weather if available
  }

  const gameDate = new Date(localTime);
  gameDate.setDate(gameDate.getDate() + daysUntil);

  return gameDate;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  // Get organization
  const org = await getOrganizationBySlug(slug);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  const orgId = org.id;
  const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));

  // Check if weather is enabled
  if (!settings.gameInfo?.enabled || !settings.gameInfo?.weather?.enabled) {
    return res.status(200).json({ weather: null, message: 'Weather not enabled' });
  }

  // Get location for geocoding
  const address = settings.gameInfo?.location?.address;
  if (!address) {
    return res.status(200).json({ weather: null, message: 'No address configured' });
  }

  // Geocode the address
  const coords = await geocodeAddress(address);
  if (!coords) {
    return res.status(200).json({ weather: null, message: 'Could not geocode address' });
  }

  // Get timezone
  const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';

  // Get weather forecast
  const forecast = await getWeatherForecast(coords.lat, coords.lng, timezone);
  if (!forecast || !forecast.hourly) {
    return res.status(200).json({ weather: null, message: 'Could not fetch weather' });
  }

  // Find the game day
  const gameDay = settings.gameInfo?.gameDay ?? 0;
  const startHour = settings.gameInfo?.startHour ?? 17;
  const endHour = settings.gameInfo?.endHour ?? 19;

  const nextGameDate = getNextGameDate(gameDay, timezone);
  const gameDateStr = nextGameDate.toISOString().split('T')[0];

  // Find hourly data for game hours
  const gameWeather = [];
  const { time, temperature_2m, weathercode, precipitation_probability } = forecast.hourly;

  for (let i = 0; i < time.length; i++) {
    const forecastTime = new Date(time[i]);
    const forecastDateStr = forecastTime.toISOString().split('T')[0];
    const forecastHour = forecastTime.getHours();

    // Check if this is game day and within game hours
    if (forecastDateStr === gameDateStr && forecastHour >= startHour && forecastHour <= endHour) {
      const weatherInfo = getWeatherInfo(weathercode[i]);
      gameWeather.push({
        time: time[i],
        hour: forecastHour,
        temperature: Math.round(temperature_2m[i]),
        weatherCode: weathercode[i],
        description: weatherInfo.description,
        icon: weatherInfo.icon,
        precipitationProbability: precipitation_probability[i]
      });
    }
  }

  // If no game weather found (game day is more than 7 days away), return message
  if (gameWeather.length === 0) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return res.status(200).json({
      weather: null,
      message: `Weather forecast for ${days[gameDay]} will be available closer to game day.`
    });
  }

  // Calculate summary (average/most common conditions during game)
  const avgTemp = Math.round(gameWeather.reduce((sum, w) => sum + w.temperature, 0) / gameWeather.length);
  const maxPrecip = Math.max(...gameWeather.map(w => w.precipitationProbability));

  // Get most severe weather code
  const mostSevereWeather = gameWeather.reduce((prev, curr) =>
    curr.weatherCode > prev.weatherCode ? curr : prev
  );

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return res.status(200).json({
    weather: {
      gameDate: gameDateStr,
      gameDay: days[gameDay],
      summary: {
        temperature: avgTemp,
        description: mostSevereWeather.description,
        icon: mostSevereWeather.icon,
        precipitationProbability: maxPrecip
      },
      hourly: gameWeather
    }
  });
}
