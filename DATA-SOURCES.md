# Data sources

The application continues to load its operational data automatically from the URLs configured in `js/app.js`.

## Refresh cadence

- NOAA alerts: every 5 minutes
- NHC forecast products: every 5 minutes
- Contract and subcontractor sheets: every 2 minutes

## External endpoints found in this build

- `https://api.weather.gov/alerts/active`
- `https://docs.google.com/spreadsheets/d/e/2PACX-1vQtCVV811NLAHOoNyGmU11deIXJbaTvXlCCPzCF5fY_LST2TdNHw9deAiI_uuc3wkvlUR8wBuzl6oHe/pub?output=csv`
- `https://docs.google.com/spreadsheets/d/e/2PACX-1vSpll5MNu-VzUpPg7cYPthmGuPGHpCDRwqpfTn1VlfZq57NTobDaxdpeiVlrtBb84raqj5kAKq387AJ/pub?output=csv`
- `https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer`
- `https://www.nhc.noaa.gov/gis/`
- `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
