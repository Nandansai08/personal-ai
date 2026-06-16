// MIT License — personal-ai
// Weather plugin: uses Open-Meteo's free, key-less API.
// Geocodes the city via open-meteo's geocoding endpoint, then fetches the
// current conditions + a short 3-day forecast.

const WMO_CODES = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'depositing rime fog',
  51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
  61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain',
  71: 'slight snow', 73: 'moderate snow', 75: 'heavy snow',
  80: 'rain showers', 81: 'heavy rain showers', 82: 'violent rain showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
}

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`)
  const data = await res.json()
  const top = (data.results || [])[0]
  if (!top) throw new Error(`could not find a place named "${city}"`)
  return { latitude: top.latitude, longitude: top.longitude, name: `${top.name}, ${top.country_code}` }
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=3&timezone=auto`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`forecast HTTP ${res.status}`)
  return res.json()
}

/** @type {import('../../src/plugins/types.js').PersonalAIPlugin} */
const plugin = {
  name: 'weather',
  version: '1.0.0',
  description: 'Current weather and short forecast via Open-Meteo (no API key required)',

  tools: [
    {
      definition: {
        name: 'weather',
        description: 'Get the current weather and a 3-day forecast for any city worldwide.',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name (e.g. "Dhanbad", "San Francisco")' },
          },
          required: ['city'],
        },
      },
      async execute(args) {
        const city = args && typeof args === 'object' && 'city' in args ? String(args.city) : ''
        if (!city) return { success: false, data: null, error: 'city is required' }

        try {
          const loc = await geocode(city)
          const w = await fetchWeather(loc.latitude, loc.longitude)
          const c = w.current
          const days = (w.daily?.time || []).map((d, i) => ({
            date: d,
            high_c: w.daily.temperature_2m_max?.[i] ?? null,
            low_c:  w.daily.temperature_2m_min?.[i] ?? null,
            summary: WMO_CODES[w.daily.weather_code?.[i]] ?? 'unknown',
          }))
          return {
            success: true,
            data: {
              location: loc.name,
              current: {
                temperature_c: c?.temperature_2m ?? null,
                humidity_pct:  c?.relative_humidity_2m ?? null,
                wind_kph:      c?.wind_speed_10m ?? null,
                summary:       WMO_CODES[c?.weather_code] ?? 'unknown',
              },
              forecast: days,
            },
          }
        } catch (err) {
          return { success: false, data: null, error: err instanceof Error ? err.message : String(err) }
        }
      },
    },
  ],
}

export default plugin
