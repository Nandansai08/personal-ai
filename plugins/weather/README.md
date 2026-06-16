# weather

Current weather + 3-day forecast for any city worldwide.

- API: [Open-Meteo](https://open-meteo.com) — free, no key, generous limits
- Geocoding: Open-Meteo's geocoding endpoint
- Tool: `weather(city)`

```
> what's the weather in Dhanbad?
  ⟳ weather… ✓
Dhanbad, IN — 31 °C, partly cloudy, 65% humidity.
3-day forecast: 32/24 thunderstorms tomorrow, 30/23 rain Wed, 29/22 rain Thu.
```

## Enable

Disabled by default so a fresh install doesn't hit external services unless
you opt in. Turn it on with:

```
/plugins enable weather
```

…or set `"enabled": true` in `plugin.json` and reload.

## Notes

- Returns `success: false` on geocoding failure (typos, ambiguous city names).
- 5 second timeout per request.
- Open-Meteo's terms are CC-BY 4.0 — attribute Open-Meteo if you publish this data.
