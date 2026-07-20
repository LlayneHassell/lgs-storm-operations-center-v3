/* LGS Storm Operations Center v3 — application logic */
'use strict';
/*** 1) YOUR PUBLISHED CSV LINKS ***/
const CONTRACTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSpll5MNu-VzUpPg7cYPthmGuPGHpCDRwqpfTn1VlfZq57NTobDaxdpeiVlrtBb84raqj5kAKq387AJ/pub?output=csv";
const SUBS_URL      = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtCVV811NLAHOoNyGmU11deIXJbaTvXlCCPzCF5fY_LST2TdNHw9deAiI_uuc3wkvlUR8wBuzl6oHe/pub?output=csv";

/*** 2) MAP SETUP (free OpenStreetMap tiles) ***/
const map = L.map('map').setView([39, -98], 4);

// Keep marker popups readable by clearing dashboard overlays until the popup closes.
map.on('popupopen', () => document.body.classList.add('map-popup-open'));
map.on('popupclose', () => document.body.classList.remove('map-popup-open'));

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

/*** 3) LAYERS ***/
const alertsLayer = L.layerGroup().addTo(map);
const contractsLayer = L.layerGroup().addTo(map);
const subsLayer = L.layerGroup().addTo(map);
const nhcConeLayer = L.layerGroup().addTo(map);
const nhcTrackLayer = L.layerGroup().addTo(map);
const nhcPointsLayer = L.layerGroup().addTo(map);

const layerControl = L.control.layers({}, {
  "Contracts": contractsLayer,
  "Subcontractors": subsLayer,
  "NOAA Weather Alerts": alertsLayer,
  "NHC Forecast Cones": nhcConeLayer,
  "NHC Forecast Tracks": nhcTrackLayer,
  "NHC Forecast Points": nhcPointsLayer
}, { collapsed: false }).addTo(map);

let contractMarkers = [];
let subMarkers = [];
let activeAlertPolygons = [];
let activeConePolygons = [];
let activeStorms = [];
let rawForecastPoints = [];
let rawForecastTracks = [];
let forecastSteps = [];
let selectedForecastIndex = 0;
let forecastPlaybackTimer = null;
let forecastFocusLayer = L.layerGroup().addTo(map);
let forecastProximityContracts = 0;
let forecastProximitySubs = 0;

let lastContractsCount = 0;
let lastSubsCount = 0;
let lastAlertsCount = 0;
let lastNHCConesCount = 0;
let lastNHCTracksCount = 0;
let lastNHCUpdate = "Not checked yet";
let lastNHCMessage = "";
let contractsInConeCount = 0;
let subsInConeCount = 0;
let lastConeBounds = null;
const DEFAULT_VIEW = { center:[39,-98], zoom:4 };

function stormSummaryHtml() {
  if (!activeStorms.length) return `<div class="storm-card"><span class="storm-card-title">Active storms:</span> None published</div>`;
  return activeStorms.map(storm => {
    const detailBits = [storm.type, storm.advisory ? `Advisory ${storm.advisory}` : "", storm.wind ? `${storm.wind} kt` : "", storm.validTime].filter(Boolean);
    return `<div class="storm-card" onclick="openStormPanel()">
      <div class="storm-card-title">${escapeHtml(storm.name)}</div>
      ${detailBits.length ? `<div>${detailBits.map(escapeHtml).join(" • ")}</div>` : ""}
      <span class="impact-badge">Cone impact: ${contractsInConeCount} contracts / ${subsInConeCount} subs</span>
    </div>`;
  }).join("");
}

function setStatus() {
  const statusBox = document.getElementById("statusBox");
  const wasCollapsed = statusBox.classList.contains("collapsed");
  const activeStormCount = activeStorms.length;
  const totalConeImpact = contractsInConeCount + subsInConeCount;
  const updateText = lastNHCUpdate === "Not checked yet" ? "Checking live feeds…" : lastNHCUpdate;
  const riskClass = totalConeImpact >= 20 ? "metric-danger" : totalConeImpact > 0 ? "metric-warning" : "metric-normal";

  statusBox.innerHTML =
    `<div class="status-title">
       <div class="status-heading"><span aria-hidden="true">◉</span><b>Executive Dashboard</b><span class="status-live-dot" title="Live data">●</span></div>
       <button class="status-toggle" type="button" onclick="toggleStatusSummary()" aria-expanded="${!wasCollapsed}">${wasCollapsed ? "Show" : "Hide"}</button>
     </div>
     <div class="status-body executive-status-body">
       <div class="executive-metrics">
         <button class="executive-metric metric-storm" onclick="zoomToStorm()" type="button">
           <span class="metric-icon">🌀</span>
           <span class="metric-value">${activeStormCount}</span>
           <span class="metric-label">Active Storms</span>
         </button>
         <button class="executive-metric ${riskClass}" onclick="showConeContracts()" type="button">
           <span class="metric-icon">📍</span>
           <span class="metric-value">${contractsInConeCount}</span>
           <span class="metric-label">Contracts at Risk</span>
         </button>
         <button class="executive-metric metric-sub" onclick="showConeSubs()" type="button">
           <span class="metric-icon">🚚</span>
           <span class="metric-value">${subsInConeCount}</span>
           <span class="metric-label">Subs in Cone</span>
         </button>
         <button class="executive-metric metric-alert" type="button">
           <span class="metric-icon">⚠️</span>
           <span class="metric-value">${lastAlertsCount}</span>
           <span class="metric-label">NOAA Alerts</span>
         </button>
       </div>
       <div class="executive-feed-status">
         <div><span class="feed-dot"></span><b>Live feeds connected</b></div>
         <span>${escapeHtml(updateText)}</span>
       </div>
       <div class="executive-secondary-grid">
         <span>Contracts loaded</span><b>${lastContractsCount}</b>
         <span>Subcontractors loaded</span><b>${lastSubsCount}</b>
         <span>NHC cones</span><b>${lastNHCConesCount}</b>
         <span>Forecast features</span><b>${lastNHCTracksCount}</b>
         <span>Near selected point</span><b>${forecastProximityContracts} / ${forecastProximitySubs}</b>
       </div>
       <div class="executive-storm-list">${stormSummaryHtml()}</div>
       ${lastNHCMessage ? `<small class="nhc-note">${escapeHtml(lastNHCMessage)}</small>` : ""}
     </div>`;
  syncMobileSummary();
  requestAnimationFrame(positionMobileZoomBelowSummary);
}

/*** HELPERS ***/
function safeNum(x) {
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : null;
}

function getField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function makePopup(title, lines, linkText, linkUrl) {
  const htmlLines = (lines || []).filter(Boolean).map(l => `<div>${l}</div>`).join("");
  const linkHtml = (linkUrl && linkText)
    ? `<div style="margin-top:8px;"><a href="${linkUrl}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a></div>`
    : "";
  return `<div style="min-width:240px;">
    <b>${escapeHtml(title || "Details")}</b>
    ${htmlLines ? `<div style="margin-top:6px;">${htmlLines}</div>` : ""}
    ${linkHtml}
  </div>`;
}

// Styles
function parseExpirationDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return new Date(year, Number(match[1]) - 1, Number(match[2]), 23, 59, 59);
}

function contractExpirationStatus(expiration) {
  const date = parseExpirationDate(expiration);
  if (!date) return { key: "active", label: "Active / no valid expiration", color: "#2e8b57" };
  const days = (date.getTime() - Date.now()) / 86400000;
  if (days < 0) return { key: "expired", label: "Expired", color: "#d9534f" };
  if (days <= 90) return { key: "expiring", label: "Expires within 90 days", color: "#f0ad4e" };
  return { key: "active", label: "Active", color: "#2e8b57" };
}

function contractStyle(markerData = {}) {
  const inCone = Boolean(markerData.insideCone);
  const inAlert = Boolean(markerData.insideAlert);
  const status = contractExpirationStatus(markerData.expiration);
  return {
    radius: inCone ? 11 : (inAlert ? 9 : 7),
    color: inCone ? "#4b0082" : (inAlert ? "#000" : "#fff"),
    weight: inCone ? 4 : (inAlert ? 3 : 1),
    fillColor: status.color,
    fillOpacity: 0.95
  };
}
function subStyle(markerData = {}) {
  const inCone = Boolean(markerData.insideCone);
  const inAlert = Boolean(markerData.insideAlert);
  return {
    radius: inCone ? 11 : (inAlert ? 9 : 7),
    color: inCone ? "#4b0082" : (inAlert ? "#000" : "#fff"),
    weight: inCone ? 4 : (inAlert ? 3 : 1),
    fillColor: "#0275d8",
    fillOpacity: 0.95
  };
}

// Robust parse: handles comma CSV or tab TSV
function parseSheet(url, onDone, onErr) {
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    delimiter: "", // auto-detect
    complete: (results) => onDone(results.data || []),
    error: (err) => {
      console.error("Sheet load error:", err);
      if (onErr) onErr(err);
    }
  });
}

/*** CONTRACTS (headers: Name State LAT LONG Expiration Link Contact Number Email) ***/
function loadContracts() {
  contractsLayer.clearLayers();
  contractMarkers = [];
  lastContractsCount = 0;
  setStatus();

  parseSheet(CONTRACTS_URL, (rows) => {
    let count = 0;

    rows.forEach(row => {
      const lat = safeNum(getField(row, ["LAT", "lat", "Latitude", "latitude"]));
      const lon = safeNum(getField(row, ["LONG", "LNG", "lng", "Longitude", "longitude"]));
      if (lat === null || lon === null) return;

      const name = getField(row, ["Name", "name"]);
      const state = getField(row, ["State", "state"]);
      const exp = getField(row, ["Expiration", "expiration"]);
      const link = getField(row, ["Link", "link"]);
      const contact = getField(row, ["Contact", "contact"]);
      const number = getField(row, ["Number", "number", "Phone", "phone"]);
      const email = getField(row, ["Email", "email"]);

      const expirationStatus = contractExpirationStatus(exp);
      const markerData = { lat, lon, expiration: exp, name: name || "Contract", state, contact, phone: number, email, link, address: "", notes: "", type: "Contract", searchText: [name,state,contact,email].filter(Boolean).join(" ").toLowerCase(), insideAlert: false, insideCone: false };
      const marker = L.circleMarker([lat, lon], contractStyle(markerData)).addTo(contractsLayer);

      const popup = makePopup(
        name || "Contract",
        [
          state ? `<b>State:</b> ${escapeHtml(state)}` : "",
          exp ? `<b>Expiration:</b> ${escapeHtml(exp)}` : "",
          `<b>Contract status:</b> ${escapeHtml(expirationStatus.label)}`,
          contact ? `<b>Contact:</b> ${escapeHtml(contact)}` : "",
          number ? `<b>Phone:</b> ${escapeHtml(number)}` : "",
          email ? `<b>Email:</b> ${escapeHtml(email)}` : ""
        ],
        link ? "Open Contract" : "",
        link || ""
      );

      marker.bindPopup(popup);
      contractMarkers.push({ marker, ...markerData });
      count++;
    });

    lastContractsCount = count;
    setStatus();
    updateHighlights();
  }, () => {
    document.getElementById("statusBox").innerHTML =
      `<b>Error loading Contracts</b><br>
       <small>Open via Live Server / localhost (not file://). Also confirm LAT and LONG columns are numeric.</small>`;
  });
}

/*** SUBS (headers: Subcontractor Name LAT LONG Address State Company Contact Company Email Company Phone Notes) ***/
function loadSubs() {
  subsLayer.clearLayers();
  subMarkers = [];
  lastSubsCount = 0;
  setStatus();

  parseSheet(SUBS_URL, (rows) => {
    let count = 0;

    rows.forEach(row => {
      const lat = safeNum(getField(row, ["LAT", "lat", "Latitude", "latitude"]));
      const lon = safeNum(getField(row, ["LONG", "LNG", "lng", "Longitude", "longitude"]));
      if (lat === null || lon === null) return;

      const subName = getField(row, ["Subcontractor Name"]);
      const address = getField(row, ["Address", "address"]);
      const state = getField(row, ["State", "state"]);
      const contact = getField(row, ["Company Contact", "Contact", "contact"]);
      const email = getField(row, ["Company Email", "Email", "email"]);
      const phone = getField(row, ["Company Phone", "Phone", "phone"]);
      const notes = getField(row, ["Notes", "notes"]);

      const title = subName
        ? subName
        : (address ? `Subcontractor @ ${address}` : "Subcontractor");

      const markerData = { lat, lon, name: title, state, address, contact, phone, email, notes, link: "", expiration: "", type: "Subcontractor", searchText: [title,address,state,contact,email,phone,notes].filter(Boolean).join(" ").toLowerCase(), insideAlert: false, insideCone: false };
      const marker = L.circleMarker([lat, lon], subStyle(markerData)).addTo(subsLayer);

      const popup = makePopup(
        title,
        [
          address ? `<b>Address:</b> ${escapeHtml(address)}` : "",
          state ? `<b>State:</b> ${escapeHtml(state)}` : "",
          contact ? `<b>Contact:</b> ${escapeHtml(contact)}` : "",
          phone ? `<b>Phone:</b> ${escapeHtml(phone)}` : "",
          email ? `<b>Email:</b> ${escapeHtml(email)}` : "",
          notes ? `<b>Notes:</b> ${escapeHtml(notes)}` : ""
        ],
        "", ""
      );

      marker.bindPopup(popup);
      subMarkers.push({ marker, ...markerData });
      count++;
    });

    lastSubsCount = count;
    setStatus();
    updateHighlights();
  }, () => {
    document.getElementById("statusBox").innerHTML =
      `<b>Error loading Subs</b><br>
       <small>Open via Live Server / localhost (not file://). Also confirm LAT and LONG columns are numeric.</small>`;
  });
}

function alertStyleForEvent(eventName) {
  const e = String(eventName || "").toLowerCase();
  if (e.includes("tornado warning")) return { color:"#b30000", fillColor:"#ff2d2d" };
  if (e.includes("hurricane warning")) return { color:"#cc5c00", fillColor:"#ff8c00" };
  if (e.includes("flash flood warning")) return { color:"#b89b00", fillColor:"#ffd43b" };
  if (e.includes("tropical storm warning")) return { color:"#005bbb", fillColor:"#3388ff" };
  return { color:"#6c3483", fillColor:"#9b59b6" };
}

/*** NOAA ALERTS (AUTOMATIC) ***/
async function loadNOAAAlerts() {
  alertsLayer.clearLayers();
  activeAlertPolygons = [];
  lastAlertsCount = 0;
  setStatus();

  try {
    const res = await fetch("https://api.weather.gov/alerts/active");
    const geojson = await res.json();

    let polyCount = 0;

    geojson.features.forEach(f => {
      if (!f.geometry) return;

      activeAlertPolygons.push(f);
      polyCount++;

      const eventName = f.properties?.event || "Weather Alert";
      const areaDesc = f.properties?.areaDesc || "";
      const ends = f.properties?.ends || f.properties?.expires || "";
      const link = f.properties?.uri || "";

      const alertColors = alertStyleForEvent(eventName);
      const layer = L.geoJSON(f, {
        style: { color: alertColors.color, fillColor: alertColors.fillColor, weight: 2, fillOpacity: 0.22 }
      }).addTo(alertsLayer);

      layer.bindPopup(makePopup(
        eventName,
        [
          areaDesc ? `<b>Area:</b> ${escapeHtml(areaDesc)}` : "",
          ends ? `<b>Ends:</b> ${escapeHtml(ends)}` : ""
        ],
        link ? "Open NOAA Alert" : "",
        link || ""
      ));
    });

    lastAlertsCount = polyCount;
    setStatus();
    updateHighlights();
  } catch (err) {
    console.error("NOAA alert load error:", err);
    document.getElementById("statusBox").innerHTML =
      `<b>Error loading NOAA alerts</b><br><small>${escapeHtml(String(err))}</small>`;
  }
}



/*** NHC FORECAST CONES + TRACKS (AUTOMATIC) ***/
// Official NOAA/NWS ArcGIS service. Unlike NHC KMZ files, these GeoJSON
// query endpoints are designed to be requested directly by web maps.
const NHC_ARCGIS_BASE = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer";
const NHC_FORECAST_POINTS_LAYER = 5;
const NHC_FORECAST_TRACK_LAYER = 6;
const NHC_FORECAST_CONE_LAYER = 7;

function nhcArcGISQueryUrl(layerId) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    t: String(Date.now())
  });
  return `${NHC_ARCGIS_BASE}/${layerId}/query?${params.toString()}`;
}

async function fetchGeoJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "NOAA service error");
  return data;
}

function nhcFeatureTitle(props = {}) {
  return props.stormname || props.STORMNAME || props.storm_name ||
         props.idp_source || props.STORM || "NHC Forecast";
}

function nhcPopupLines(props = {}) {
  const lines = [];
  const type = props.stormtype || props.STORMTYPE || props.tcclass || "";
  const advisory = props.advnum || props.ADVNUM || props.advisory || "";
  const forecastHour = props.fcsthr || props.FCSHR || props.tau || props.TAU || "";
  const validTime = props.validtime || props.VALIDTIME || props.dvlbl || props.DATELBL || "";
  const wind = props.maxwind || props.MAXWIND || props.windspd || "";

  if (type) lines.push(`<b>Type:</b> ${escapeHtml(type)}`);
  if (advisory !== "") lines.push(`<b>Advisory:</b> ${escapeHtml(advisory)}`);
  if (forecastHour !== "") lines.push(`<b>Forecast hour:</b> ${escapeHtml(forecastHour)}`);
  if (validTime) lines.push(`<b>Valid:</b> ${escapeHtml(validTime)}`);
  if (wind !== "") lines.push(`<b>Maximum wind:</b> ${escapeHtml(wind)} kt`);
  return lines;
}

function drawNHCCone(geojson) {
  const features = geojson?.features || [];
  activeConePolygons = features.filter(feature => feature.geometry);
  if (!features.length) return 0;

  const coneGeoLayer = L.geoJSON(geojson, {
    style: {
      color: "#7b2cbf",
      weight: 2,
      fillColor: "#c77dff",
      fillOpacity: 0.28
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(makePopup(
        nhcFeatureTitle(feature.properties),
        nhcPopupLines(feature.properties),
        "Open NHC GIS Page",
        "https://www.nhc.noaa.gov/gis/"
      ));
    }
  }).addTo(nhcConeLayer);
  try { lastConeBounds = coneGeoLayer.getBounds(); } catch {}

  return features.length;
}

function forecastHourFromProps(props = {}) {
  const value = props.fcsthr ?? props.FCSHR ?? props.tau ?? props.TAU ?? props.forecasthr ?? props.FORECASTHR;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function forecastLabelFromProps(props = {}) {
  return props.dvlbl || props.DATELBL || props.validtime || props.VALIDTIME ||
         props.fldatelbl || props.FLDATELBL || props.adjdate || props.ADJDATE || "";
}

function formatForecastLabel(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
    let n = Number(value);
    if (n < 1e12) n *= 1000;
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString([], { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" });
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime()) && String(value).match(/[T:\/-]/)) {
    return d.toLocaleString([], { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" });
  }
  return String(value);
}

function uniqueStormsFromFeatures(features) {
  const byName = new Map();
  for (const feature of features || []) {
    const props = feature.properties || {};
    const name = nhcFeatureTitle(props);
    const current = byName.get(name) || {
      name, type: "", advisory: "", wind: "", validTime: "", forecasts: [],
      pressure: "", movement: "", latitude: "", longitude: ""
    };
    current.type = current.type || props.stormtype || props.STORMTYPE || props.tcclass || props.TCCLASS || "";
    current.advisory = current.advisory || props.advnum || props.ADVNUM || props.advisory || "";
    current.wind = current.wind || props.maxwind || props.MAXWIND || props.windspd || props.WINDSPD || "";
    current.pressure = current.pressure || props.mslp || props.MSLP || props.pressure || props.PRESSURE || props.minpress || props.MINPRESS || "";
    const direction = props.movement || props.MOVEMENT || props.motion || props.MOTION || props.stormdir || props.STORMDIR || props.direction || props.DIRECTION || "";
    const speed = props.stormspeed || props.STORMSPEED || props.speed || props.SPEED || props.movspeed || props.MOVSPEED || "";
    current.movement = current.movement || ([direction, speed !== "" ? `${speed} kt` : ""].filter(Boolean).join(" @ "));
    if (feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
      current.longitude = current.longitude || feature.geometry.coordinates[0];
      current.latitude = current.latitude || feature.geometry.coordinates[1];
    }
    const rawLabel = forecastLabelFromProps(props);
    current.validTime = current.validTime || formatForecastLabel(rawLabel);
    if (rawLabel) {
      const label = formatForecastLabel(rawLabel);
      const hour = forecastHourFromProps(props);
      if (!current.forecasts.some(item => item.label === label && item.hour === hour)) {
        current.forecasts.push({ label, hour, wind: props.maxwind || props.MAXWIND || props.windspd || props.WINDSPD || "" });
      }
    }
    byName.set(name, current);
  }
  for (const storm of byName.values()) {
    storm.forecasts.sort((a,b) => (a.hour ?? 9999) - (b.hour ?? 9999));
  }
  return [...byName.values()];
}

function drawNHCTrack(trackGeoJSON, pointsGeoJSON) {
  let count = 0;
  const tracks = trackGeoJSON?.features || [];
  const points = pointsGeoJSON?.features || [];
  rawForecastTracks = tracks;
  rawForecastPoints = points;

  if (tracks.length) {
    L.geoJSON(trackGeoJSON, {
      style: { color: "#6a040f", weight: 3, opacity: 0.95 },
      onEachFeature: (feature, layer) => layer.bindPopup(makePopup(
        nhcFeatureTitle(feature.properties), nhcPopupLines(feature.properties),
        "Open NHC GIS Page", "https://www.nhc.noaa.gov/gis/"
      ))
    }).addTo(nhcTrackLayer);
    count += tracks.length;
  }

  if (points.length) {
    L.geoJSON(pointsGeoJSON, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 5, color: "#6a040f", weight: 2, fillColor: "#fff", fillOpacity: 1
      }),
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        layer.bindPopup(makePopup(
          nhcFeatureTitle(props), nhcPopupLines(props),
          "Open NHC GIS Page", "https://www.nhc.noaa.gov/gis/"
        ));
        const rawDate = forecastLabelFromProps(props);
        const hour = forecastHourFromProps(props);
        const dateLabel = formatForecastLabel(rawDate);
        const label = dateLabel || (hour !== null ? `+${hour} hr` : "");
        if (label) {
          layer.bindTooltip(label, { permanent:true, direction:"top", className:"forecast-label", opacity:0.95 });
        }
      }
    }).addTo(nhcPointsLayer);
    count += points.length;
  }

  activeStorms = uniqueStormsFromFeatures([...points, ...tracks]);
  buildForecastTimeline();
  return count;
}

async function loadNHCForecasts() {
  nhcConeLayer.clearLayers();
  nhcTrackLayer.clearLayers();
  nhcPointsLayer.clearLayers();
  activeConePolygons = [];
  activeStorms = [];
  rawForecastPoints = [];
  rawForecastTracks = [];
  forecastSteps = [];
  forecastFocusLayer.clearLayers();
  lastConeBounds = null;
  lastNHCConesCount = 0;
  lastNHCTracksCount = 0;
  lastNHCMessage = "Checking NOAA tropical forecast service…";
  setStatus();

  try {
    const [coneData, trackData, pointData] = await Promise.all([
      fetchGeoJSON(nhcArcGISQueryUrl(NHC_FORECAST_CONE_LAYER)),
      fetchGeoJSON(nhcArcGISQueryUrl(NHC_FORECAST_TRACK_LAYER)),
      fetchGeoJSON(nhcArcGISQueryUrl(NHC_FORECAST_POINTS_LAYER))
    ]);

    lastNHCConesCount = drawNHCCone(coneData);
    lastNHCTracksCount = drawNHCTrack(trackData, pointData);
    lastNHCUpdate = new Date().toLocaleString();

    if (!lastNHCConesCount && !lastNHCTracksCount) {
      lastNHCMessage = "No active NHC forecast cones or tracks are currently available.";
    } else {
      lastNHCMessage = `Loaded ${lastNHCConesCount} cone feature(s) and ${lastNHCTracksCount} track/forecast feature(s).`;
    }
    updateHighlights();
    setStatus();
  } catch (err) {
    console.error("NHC forecast load error:", err);
    lastNHCUpdate = new Date().toLocaleString();
    lastNHCMessage = `Unable to load NOAA tropical forecast data: ${String(err)}`;
    setStatus();
  }
}



function featurePointCoordinates(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === "Point" && Array.isArray(g.coordinates)) return g.coordinates;
  return null;
}

function buildForecastTimeline() {
  forecastSteps = rawForecastPoints.map((feature, index) => {
    const props = feature.properties || {};
    return {
      feature,
      index,
      hour: forecastHourFromProps(props),
      label: formatForecastLabel(forecastLabelFromProps(props)),
      wind: props.maxwind || props.MAXWIND || props.windspd || props.WINDSPD || "",
      storm: nhcFeatureTitle(props),
      coordinates: featurePointCoordinates(feature)
    };
  }).filter(x => x.coordinates).sort((a,b) => (a.hour ?? 9999) - (b.hour ?? 9999));

  const slider = document.getElementById("forecastSlider");
  const ticks = document.getElementById("forecastTicks");
  if (!slider || !ticks) return;
  slider.max = Math.max(0, forecastSteps.length - 1);
  slider.value = 0;
  selectedForecastIndex = 0;
  ticks.innerHTML = forecastSteps.length
    ? forecastSteps.map((s,i) => `<span>${s.hour === 0 || s.hour === null ? (i===0 ? "Now" : "Time") : `+${s.hour}h`}</span>`).join("")
    : "<span>No active forecast</span>";
  applyForecastStep(0, false);
}

function distanceMiles(a, b) {
  try { return turf.distance(turf.point(a), turf.point(b), {units:"miles"}); }
  catch { return Infinity; }
}

function applyForecastStep(index, panMap=true) {
  if (!forecastSteps.length) {
    document.getElementById("forecastTimeLabel").textContent = "No active forecast";
    return;
  }
  selectedForecastIndex = Math.max(0, Math.min(index, forecastSteps.length - 1));
  const step = forecastSteps[selectedForecastIndex];
  const label = step.hour === 0 || step.hour === null ? "Now" : `+${step.hour} hr`;
  document.getElementById("forecastTimeLabel").textContent = `${label}${step.wind ? ` • ${step.wind} kt` : ""}`;
  document.getElementById("forecastSlider").value = selectedForecastIndex;

  nhcPointsLayer.clearLayers();
  nhcTrackLayer.clearLayers();
  forecastFocusLayer.clearLayers();

  const visiblePoints = forecastSteps.slice(0, selectedForecastIndex + 1).map(x => x.feature);
  L.geoJSON({type:"FeatureCollection", features:visiblePoints}, {
    pointToLayer:(feature,latlng) => L.circleMarker(latlng, {
      radius: feature === step.feature ? 8 : 4,
      color:"#6a040f", weight:2, fillColor: feature === step.feature ? "#ffd43b" : "#fff", fillOpacity:1
    }),
    onEachFeature:(feature,layer) => layer.bindPopup(makePopup(nhcFeatureTitle(feature.properties), nhcPopupLines(feature.properties), "Open NHC GIS Page", "https://www.nhc.noaa.gov/gis/"))
  }).addTo(nhcPointsLayer);

  const lineCoords = visiblePoints.map(featurePointCoordinates).filter(Boolean);
  if (lineCoords.length > 1) {
    L.geoJSON({type:"Feature", properties:{}, geometry:{type:"LineString", coordinates:lineCoords}}, {style:{color:"#6a040f",weight:4,opacity:.95}}).addTo(nhcTrackLayer);
  }

  const [lon,lat] = step.coordinates;
  const radiusMiles = 100;
  L.circle([lat,lon], {radius:radiusMiles*1609.344, color:"#d97706", weight:2, dashArray:"7 6", fillColor:"#f59e0b", fillOpacity:.08, className:"forecast-focus-ring"}).addTo(forecastFocusLayer);
  forecastProximityContracts = contractMarkers.filter(o => distanceMiles([o.lon,o.lat], step.coordinates) <= radiusMiles).length;
  forecastProximitySubs = subMarkers.filter(o => distanceMiles([o.lon,o.lat], step.coordinates) <= radiusMiles).length;
  setStatus();
  if (panMap) map.panTo([lat,lon], {animate:true});
}

function toggleForecastPlayback() {
  const button = document.getElementById("forecastPlayButton");
  if (forecastPlaybackTimer) {
    clearInterval(forecastPlaybackTimer); forecastPlaybackTimer = null; button.textContent = "▶ Play"; return;
  }
  if (!forecastSteps.length) { alert("No active forecast timeline is available."); return; }
  button.textContent = "❚❚ Pause";
  forecastPlaybackTimer = setInterval(() => {
    let next = selectedForecastIndex + 1;
    if (next >= forecastSteps.length) next = 0;
    applyForecastStep(next);
  }, 1800);
}

function activeForecastStep() { return forecastSteps[selectedForecastIndex] || null; }
function resultTableRows(items, limit=100) {
  return items.slice(0,limit).map(o => `<tr><td>${escapeHtml(o.name||"")}</td><td>${escapeHtml(o.state||"")}</td><td>${escapeHtml(o.contact||"")}</td><td>${escapeHtml(o.phone||"")}</td><td>${escapeHtml(o.email||"")}</td></tr>`).join("");
}
function activeAlertRows(limit=50) {
  return activeAlertPolygons.slice(0,limit).map(f => `<tr><td>${escapeHtml(f.properties?.event||"Weather Alert")}</td><td>${escapeHtml(f.properties?.areaDesc||"")}</td><td>${escapeHtml(formatForecastLabel(f.properties?.ends||f.properties?.expires||""))}</td></tr>`).join("");
}

async function generateStormBrief() {
  toggleMobilePanels(false);
  const step = activeForecastStep();
  const storm = activeStorms[0] || {};
  const contracts = markersInCone(contractMarkers);
  const subs = markersInCone(subMarkers);
  let mapImage = "";
  try {
    const canvas = await html2canvas(document.getElementById("map"), {useCORS:true, allowTaint:false, logging:false, scale:1});
    mapImage = canvas.toDataURL("image/png");
  } catch (err) { console.warn("Map snapshot unavailable", err); }

  const w = window.open("", "_blank");
  if (!w) { alert("Please allow popups to generate the storm brief."); return; }
  const forecastRows = (storm.forecasts||[]).slice(0,12).map(p => `<tr><td>${p.hour===null?"":`+${p.hour} hr`}</td><td>${escapeHtml(p.label||"")}</td><td>${escapeHtml(p.wind||"")}${p.wind?" kt":""}</td></tr>`).join("");
  const selectedLabel = step ? `${step.hour===0||step.hour===null?"Now":`+${step.hour} hours`} — ${step.label||""}` : "Current advisory";
  const html = `<!doctype html><html><head><title>LGS Storm Operations Brief</title><style>
    @page{size:letter;margin:.45in} body{font-family:Arial,sans-serif;color:#172033;margin:0} header{border-bottom:4px solid #0b2545;padding-bottom:12px;margin-bottom:15px;display:flex;justify-content:space-between}.brand{font-size:25px;font-weight:800;color:#0b2545}.subtitle{font-size:14px;color:#555}h2{font-size:17px;color:#0b2545;border-bottom:2px solid #dce3ea;padding-bottom:4px;margin:17px 0 8px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metric{background:#eef3f7;border-radius:7px;padding:9px}.metric b{display:block;font-size:20px;color:#0b2545}.mapshot{width:100%;max-height:380px;object-fit:cover;border:1px solid #aaa}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:5px;text-align:left;vertical-align:top}th{background:#eaf0f6}.note{font-size:10px;color:#666}.page-break{page-break-before:always}.no-print{margin:12px 0;padding:10px;border:1px solid #ccc;background:#f7f7f7}@media print{.no-print{display:none}}
  </style></head><body><div class="no-print"><button onclick="window.print()">Print / Save as PDF</button> This browser print dialog can save the brief as a PDF.</div>
  <header><div><div class="brand">Looks Great Services</div><div class="subtitle">Storm Operations Brief</div></div><div><b>${escapeHtml(storm.name||"Active Tropical Forecast")}</b><br>${escapeHtml(selectedLabel)}<br><small>Generated ${escapeHtml(new Date().toLocaleString())}</small></div></header>
  <div class="metrics"><div class="metric"><b>${contracts.length}</b>Contracts in cone</div><div class="metric"><b>${subs.length}</b>Subs in cone</div><div class="metric"><b>${lastAlertsCount}</b>Alert polygons</div><div class="metric"><b>${forecastProximityContracts}/${forecastProximitySubs}</b>Contracts/subs within 100 mi of selected point</div></div>
  <h2>Current Advisory</h2><p><b>Classification:</b> ${escapeHtml(storm.type||"Not available")} &nbsp; <b>Advisory:</b> ${escapeHtml(storm.advisory||"Not available")} &nbsp; <b>Maximum wind:</b> ${escapeHtml(storm.wind||"Not available")}${storm.wind?" kt":""}<br><b>Latest forecast:</b> ${escapeHtml(storm.validTime||"Not available")}</p>
  <h2>Storm Map</h2>${mapImage?`<img class="mapshot" src="${mapImage}">`:`<p class="note">A map image could not be captured by this browser. OpenStreetMap tile security settings can prevent screenshots; the operational tables below remain complete.</p>`}
  <h2>Forecast Timeline</h2><table><thead><tr><th>Forecast hour</th><th>Valid time</th><th>Wind</th></tr></thead><tbody>${forecastRows||"<tr><td colspan=3>No forecast points available.</td></tr>"}</tbody></table>
  <h2>Resource Coverage</h2><p><b>Loaded contracts:</b> ${lastContractsCount} &nbsp; <b>Loaded subcontractors:</b> ${lastSubsCount}<br><b>Inside official cone:</b> ${contracts.length} contracts and ${subs.length} subcontractors.<br><b>Within 100 miles of selected forecast point:</b> ${forecastProximityContracts} contracts and ${forecastProximitySubs} subcontractors.</p><p class="note">Equipment totals require dedicated truck, crew, and equipment columns in the subcontractor sheet.</p>
  <div class="page-break"></div><h2>Contracts in Cone</h2><table><thead><tr><th>Name</th><th>State</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead><tbody>${resultTableRows(contracts)||"<tr><td colspan=5>None</td></tr>"}</tbody></table>
  <h2>Subcontractors in Cone</h2><table><thead><tr><th>Name</th><th>State</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead><tbody>${resultTableRows(subs)||"<tr><td colspan=5>None</td></tr>"}</tbody></table>
  <h2>Active Weather Alerts</h2><table><thead><tr><th>Alert</th><th>Area</th><th>Ends</th></tr></thead><tbody>${activeAlertRows()||"<tr><td colspan=3>None loaded</td></tr>"}</tbody></table>
  <h2>Operations Notes</h2><div style="height:120px;border:1px solid #aaa"></div><p class="note">Forecasts and warnings change. Confirm all mobilization decisions against the latest official NHC and National Weather Service products.</p></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

/*** HIGHLIGHT PINS INSIDE ALERTS AND NHC CONES ***/
function pointInsidePolygons(lon, lat, polygons) {
  if (!polygons.length) return false;
  const pt = turf.point([lon, lat]);
  for (const feature of polygons) {
    try {
      if (!feature.geometry) continue;
      if (turf.booleanPointInPolygon(pt, turf.feature(feature.geometry))) return true;
    } catch (err) {
      console.debug("Polygon check skipped", err);
    }
  }
  return false;
}

function updateHighlights() {
  contractsInConeCount = 0;
  subsInConeCount = 0;

  contractMarkers.forEach(o => {
    o.insideAlert = pointInsidePolygons(o.lon, o.lat, activeAlertPolygons);
    o.insideCone = pointInsidePolygons(o.lon, o.lat, activeConePolygons);
    if (o.insideCone) contractsInConeCount++;
    o.marker.setStyle(contractStyle(o));
  });

  subMarkers.forEach(o => {
    o.insideAlert = pointInsidePolygons(o.lon, o.lat, activeAlertPolygons);
    o.insideCone = pointInsidePolygons(o.lon, o.lat, activeConePolygons);
    if (o.insideCone) subsInConeCount++;
    o.marker.setStyle(subStyle(o));
  });

  setStatus();
}

function positionMobileZoomBelowSummary() {
  const zoomCorner = document.querySelector(".leaflet-top.leaflet-left");
  const panelsButton = document.getElementById("mobilePanelsButton");
  if (!zoomCorner) return;
  if (window.matchMedia("(max-width: 760px)").matches) {
    const nextTop = panelsButton ? panelsButton.offsetTop + panelsButton.offsetHeight + 8 : 212;
    zoomCorner.style.top = `${nextTop}px`;
    zoomCorner.style.left = "8px";
    zoomCorner.style.right = "auto";
  } else {
    zoomCorner.style.top = "";
    zoomCorner.style.left = "";
    zoomCorner.style.right = "";
  }
}

function toggleStatusSummary(forceCollapsed) {
  const box = document.getElementById("statusBox");
  const shouldCollapse = typeof forceCollapsed === "boolean" ? forceCollapsed : !box.classList.contains("collapsed");
  box.classList.toggle("collapsed", shouldCollapse);
  const button = box.querySelector(".status-toggle");
  if (button) {
    button.textContent = shouldCollapse ? "Show" : "Hide";
    button.setAttribute("aria-expanded", String(!shouldCollapse));
  }
  try { localStorage.setItem("lgsSummaryCollapsed", shouldCollapse ? "1" : "0"); } catch (e) {}
  requestAnimationFrame(positionMobileZoomBelowSummary);
}

function initializeStatusSummary() {
  let saved = null;
  try { saved = localStorage.getItem("lgsSummaryCollapsed"); } catch (e) {}
  const collapseByDefault = saved === null ? window.matchMedia("(max-width: 760px)").matches : saved === "1";
  document.getElementById("statusBox").classList.toggle("collapsed", collapseByDefault);
  requestAnimationFrame(positionMobileZoomBelowSummary);
}

function toggleLegend() {
  const box = document.getElementById("legendBox");
  box.classList.toggle("collapsed");
  box.querySelector("button").textContent = box.classList.contains("collapsed") ? "Show" : "Hide";
}

function syncMobileSummary() {
  const source = document.querySelector("#statusBox .status-body");
  const target = document.getElementById("mobileSummaryContent");
  if (source && target) target.innerHTML = source.innerHTML;
}

function buildMobileLegend() {
  const source = document.querySelector("#legendBox .legend-body");
  const target = document.getElementById("mobileLegendContent");
  if (source && target && !target.innerHTML.trim()) target.innerHTML = source.innerHTML;
}

const mobileLayerDefinitions = [
  ["Contracts", contractsLayer],
  ["Subcontractors", subsLayer],
  ["NOAA Weather Alerts", alertsLayer],
  ["NHC Forecast Cones", nhcConeLayer],
  ["NHC Forecast Tracks", nhcTrackLayer],
  ["NHC Forecast Points", nhcPointsLayer]
];

function buildMobileLayers() {
  const target = document.getElementById("mobileLayersContent");
  if (!target || target.dataset.ready) return;
  target.innerHTML = mobileLayerDefinitions.map((entry, i) => `<label class="mobile-layer-row"><input type="checkbox" data-layer-index="${i}" ${map.hasLayer(entry[1]) ? "checked" : ""}> <span>${entry[0]}</span></label>`).join("");
  target.querySelectorAll("input[data-layer-index]").forEach(input => input.addEventListener("change", () => {
    const layer = mobileLayerDefinitions[Number(input.dataset.layerIndex)][1];
    if (input.checked) map.addLayer(layer); else map.removeLayer(layer);
  }));
  target.dataset.ready = "1";
}

function toggleMobilePanels(forceOpen) {
  const drawer = document.getElementById("mobilePanelsDrawer");
  const button = document.getElementById("mobilePanelsButton");
  const open = typeof forceOpen === "boolean" ? forceOpen : !drawer.classList.contains("open");
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  button.setAttribute("aria-expanded", String(open));
  button.textContent = open ? "✕ Close Panels" : "☰ Panels";
  if (open) { buildMobileLegend(); buildMobileLayers(); syncMobileSummary(); }
}

function toggleMobilePanelSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  section.classList.toggle("open");
}

function openFromMobilePanels(action) {
  toggleMobilePanels(false);
  if (typeof action === "function") action();
}

function resetMapView() {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
}

function zoomToStorm() {
  if (lastConeBounds && lastConeBounds.isValid()) map.fitBounds(lastConeBounds.pad(0.12));
  else alert("No active NHC forecast cone is currently available.");
}

function markersInCone(items) { return items.filter(x => x.insideCone); }

function zoomToItems(items, emptyMessage) {
  if (!items.length) { alert(emptyMessage); return; }
  const bounds = L.latLngBounds(items.map(x => [x.lat, x.lon]));
  map.fitBounds(bounds.pad(0.18));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function resultRows(items) {
  return items.map(o => ({
    Type: o.type || "",
    Name: o.name || "",
    Address: o.address || "",
    State: o.state || "",
    Contact: o.contact || "",
    Phone: o.phone || "",
    Email: o.email || "",
    Expiration: o.expiration || "",
    Notes: o.notes || "",
    Link: o.link || "",
    Latitude: o.lat,
    Longitude: o.lon
  }));
}

function downloadConeResults(kind) {
  const items = kind === "contracts" ? markersInCone(contractMarkers) : markersInCone(subMarkers);
  if (!items.length) { alert("There are no results to download."); return; }
  const rows = resultRows(items);
  const headers = Object.keys(rows[0]);
  const csv = [headers.map(csvEscape).join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))].join("\r\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-inside-nhc-cone.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function copyConeResults(kind) {
  const items = kind === "contracts" ? markersInCone(contractMarkers) : markersInCone(subMarkers);
  if (!items.length) { alert("There are no results to copy."); return; }
  const text = items.map((o,i) => `${i+1}. ${o.name || "Result"}${o.state ? ` — ${o.state}` : ""}${o.contact ? `\nContact: ${o.contact}` : ""}${o.phone ? `\nPhone: ${o.phone}` : ""}${o.email ? `\nEmail: ${o.email}` : ""}${o.expiration ? `\nExpiration: ${o.expiration}` : ""}${o.address ? `\nAddress: ${o.address}` : ""}`).join("\n\n");
  try { await navigator.clipboard.writeText(text); alert("Result list copied."); }
  catch { prompt("Copy the result list:", text); }
}

function printConeResults(kind) {
  const items = kind === "contracts" ? markersInCone(contractMarkers) : markersInCone(subMarkers);
  if (!items.length) { alert("There are no results to print."); return; }
  const title = kind === "contracts" ? "Contracts Inside NHC Forecast Cone" : "Subcontractors Inside NHC Forecast Cone";
  const rows = items.map(o => `<tr><td>${escapeHtml(o.name || "")}</td><td>${escapeHtml(o.address || "")}</td><td>${escapeHtml(o.state || "")}</td><td>${escapeHtml(o.contact || "")}</td><td>${escapeHtml(o.phone || "")}</td><td>${escapeHtml(o.email || "")}</td><td>${escapeHtml(o.expiration || "")}</td></tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow popups to print the report."); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial;padding:24px}h1{font-size:22px}p{color:#555}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eef2f6}</style></head><body><h1>${title}</h1><p>Generated ${new Date().toLocaleString()} • ${items.length} result(s)</p><table><thead><tr><th>Name</th><th>Address</th><th>State</th><th>Contact</th><th>Phone</th><th>Email</th><th>Expiration</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function focusConeResult(kind, index) {
  const items = kind === "contracts" ? markersInCone(contractMarkers) : markersInCone(subMarkers);
  const item = items[index];
  if (!item) return;
  closeStormPanel();
  map.setView([item.lat, item.lon], Math.max(map.getZoom(), 8));
  setTimeout(() => item.marker.openPopup(), 200);
}

function openConeResults(kind) {
  const items = kind === "contracts" ? markersInCone(contractMarkers) : markersInCone(subMarkers);
  const singular = kind === "contracts" ? "contract" : "subcontractor";
  const title = kind === "contracts" ? "Contracts Inside NHC Cone" : "Subcontractors Inside NHC Cone";
  if (items.length) zoomToItems(items, "");
  const cards = items.length ? items.map((o,i) => `
    <div class="result-card" onclick="focusConeResult('${kind}', ${i})">
      <b>${escapeHtml(o.name || singular)}</b>
      <div class="result-meta">
        ${o.address ? `${escapeHtml(o.address)}<br>` : ""}
        ${o.state ? `<b>State:</b> ${escapeHtml(o.state)}<br>` : ""}
        ${o.contact ? `<b>Contact:</b> ${escapeHtml(o.contact)}<br>` : ""}
        ${o.phone ? `<b>Phone:</b> <a href="tel:${escapeHtml(o.phone)}" onclick="event.stopPropagation()">${escapeHtml(o.phone)}</a><br>` : ""}
        ${o.email ? `<b>Email:</b> <a href="mailto:${escapeHtml(o.email)}" onclick="event.stopPropagation()">${escapeHtml(o.email)}</a><br>` : ""}
        ${o.expiration ? `<b>Expiration:</b> ${escapeHtml(o.expiration)}<br>` : ""}
        ${o.notes ? `<b>Notes:</b> ${escapeHtml(o.notes)}` : ""}
      </div>
    </div>`).join("") : `<div class="result-empty">No ${singular}s are currently inside an active NHC forecast cone.</div>`;
  document.getElementById("stormPanel").classList.add("results-mode");
  document.getElementById("stormPanelBody").innerHTML = `
    <h2>${title}</h2>
    <div class="results-summary"><b>${items.length}</b> ${items.length === 1 ? singular : singular + "s"} currently inside the active cone.</div>
    <div class="results-toolbar">
      <button onclick="copyConeResults('${kind}')">Copy List</button>
      <button onclick="downloadConeResults('${kind}')">Download CSV</button>
      <button onclick="printConeResults('${kind}')">Print</button>
    </div>
    <div class="result-list">${cards}</div>`;
  setStormPanelOpen(true);
}

function showConeContracts() { openConeResults("contracts"); }
function showConeSubs() { openConeResults("subs"); }

function runMapSearch() {
  const q = document.getElementById("mapSearch").value.trim().toLowerCase();
  if (!q) return;
  const matches = [...contractMarkers, ...subMarkers].filter(x => (x.searchText || "").includes(q));
  if (!matches.length) { alert(`No map results found for “${q}”.`); return; }
  zoomToItems(matches, "No matches found.");
  if (matches.length === 1) matches[0].marker.openPopup();
  else {
    const body = matches.slice(0,100).map((x,i)=>`<div class="result-item" onclick="focusSearchResult(${i})"><b>${escapeHtml(x.name || "Result")}</b>${x.state ? `<br><small>${escapeHtml(x.state)}</small>` : ""}</div>`).join("");
    window.currentSearchResults = matches;
    document.getElementById("stormPanel").classList.add("results-mode");
    document.getElementById("stormPanelBody").innerHTML = `<h3>Search Results (${matches.length})</h3><div class="result-list">${body}</div>`;
    setStormPanelOpen(true);
  }
}

function focusSearchResult(index) {
  const item = (window.currentSearchResults || [])[index];
  if (!item) return;
  map.setView([item.lat,item.lon], 8);
  item.marker.openPopup();
}

document.getElementById("mapSearch").addEventListener("keydown", e => { if (e.key === "Enter") runMapSearch(); });

function operationalStatesForMarkers(markers) {
  const states = [...new Set(markersInCone(markers).map(item => String(item.state || "").trim()).filter(Boolean))];
  return states.sort();
}

function stormImpactScore() {
  const contractWeight = Math.min(40, contractsInConeCount * 4);
  const subWeight = Math.min(20, subsInConeCount * 2);
  const alertWeight = Math.min(25, lastAlertsCount * 2);
  const stormWeight = activeStorms.length ? 15 : 0;
  return Math.min(100, contractWeight + subWeight + alertWeight + stormWeight);
}

function impactLevel(score) {
  if (score >= 80) return "SEVERE";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "ELEVATED";
  if (score > 0) return "GUARDED";
  return "LOW";
}

function intelligenceValue(value, fallback = "Not published") {
  return value === undefined || value === null || value === "" ? fallback : escapeHtml(value);
}

function openStormPanel() {
  document.getElementById("stormPanel").classList.remove("results-mode");
  const score = stormImpactScore();
  const level = impactLevel(score);
  const contractStates = operationalStatesForMarkers(contractMarkers);
  const subStates = operationalStatesForMarkers(subMarkers);
  const threatenedStates = [...new Set([...contractStates, ...subStates])];

  const stormsHtml = activeStorms.length ? activeStorms.map((storm, index) => `
    <section class="intel-storm-card">
      <div class="intel-storm-heading">
        <div><span class="intel-kicker">ACTIVE SYSTEM ${activeStorms.length > 1 ? index + 1 : ""}</span><h2>${escapeHtml(storm.name)}</h2></div>
        <span class="intel-classification">${intelligenceValue(storm.type, "Tropical system")}</span>
      </div>
      <div class="intel-grid">
        <div class="intel-stat"><span>Maximum Wind</span><strong>${intelligenceValue(storm.wind)}${storm.wind ? " kt" : ""}</strong></div>
        <div class="intel-stat"><span>Pressure</span><strong>${intelligenceValue(storm.pressure)}${storm.pressure ? " mb" : ""}</strong></div>
        <div class="intel-stat"><span>Movement</span><strong>${intelligenceValue(storm.movement)}</strong></div>
        <div class="intel-stat"><span>Advisory</span><strong>${storm.advisory ? `#${escapeHtml(storm.advisory)}` : "Not published"}</strong></div>
        <div class="intel-stat intel-wide"><span>Latest Forecast Time</span><strong>${intelligenceValue(storm.validTime)}</strong></div>
      </div>
      ${storm.forecasts?.length ? `<div class="intel-timeline"><div class="intel-section-title">Forecast Timing</div>${storm.forecasts.slice(0,8).map(point => `<div class="intel-timeline-row"><b>${point.hour !== null ? `+${point.hour} hr` : "Current"}</b><span>${escapeHtml(point.label)}${point.wind ? ` • ${escapeHtml(point.wind)} kt` : ""}</span></div>`).join("")}</div>` : ""}
    </section>`).join("") : `<div class="intel-empty"><h3>No active NHC tropical forecast</h3><p>The panel will populate automatically when NHC publishes an active system.</p></div>`;

  const contractNames = markersInCone(contractMarkers).slice(0,25).map(x=>`<li>${escapeHtml(x.name || "Contract")}${x.state ? ` <span>${escapeHtml(x.state)}</span>` : ""}</li>`).join("");
  const subNames = markersInCone(subMarkers).slice(0,25).map(x=>`<li>${escapeHtml(x.name || "Subcontractor")}${x.state ? ` <span>${escapeHtml(x.state)}</span>` : ""}</li>`).join("");

  document.getElementById("stormPanelBody").innerHTML = `
    <div class="intel-briefing-header">
      <div><span class="intel-kicker">LIVE BRIEFING</span><h1>Storm Intelligence</h1></div>
      <div class="intel-update">NHC checked<br><b>${escapeHtml(lastNHCUpdate)}</b></div>
    </div>
    ${stormsHtml}
    <section class="intel-impact-card">
      <div class="intel-impact-score"><span>Operational Impact</span><strong>${score}</strong><small>/100</small><em class="impact-${level.toLowerCase()}">${level}</em></div>
      <div class="intel-impact-metrics">
        <div><b>${contractsInConeCount}</b><span>Contracts in cone</span></div>
        <div><b>${subsInConeCount}</b><span>Subs in cone</span></div>
        <div><b>${lastAlertsCount}</b><span>NOAA alert polygons</span></div>
        <div><b>${forecastProximityContracts + forecastProximitySubs}</b><span>Resources near selected point</span></div>
      </div>
    </section>
    <section class="intel-section">
      <div class="intel-section-title">Operational States</div>
      <div class="intel-state-list">${threatenedStates.length ? threatenedStates.map(state => `<span>${escapeHtml(state)}</span>`).join("") : `<small>No contract or subcontractor states currently intersect the cone.</small>`}</div>
    </section>
    <section class="intel-section intel-lists">
      ${contractNames ? `<details><summary>Impacted Contracts (${contractsInConeCount})</summary><ul>${contractNames}</ul></details>` : ""}
      ${subNames ? `<details><summary>Available Subcontractors (${subsInConeCount})</summary><ul>${subNames}</ul></details>` : ""}
      ${!contractNames && !subNames ? `<p>No mapped contracts or subcontractors currently fall inside the published cone.</p>` : ""}
      <small>Lists show the first 25 results in each category.</small>
    </section>
    <div class="timing-note"><b>Planning note:</b> Forecast points and the cone are planning guidance, not guaranteed impact locations or landfall times. Conditions can change with every advisory.</div>`;
  setStormPanelOpen(true);
}

function setStormPanelOpen(open) {
  const panel = document.getElementById("stormPanel");
  if (!panel) return;
  panel.classList.toggle("open", open);
  document.body.classList.toggle("mobile-results-open", open);
  if (open) toggleMobilePanels(false);
}

function closeStormPanel() { setStormPanelOpen(false); }

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 760px)").matches) toggleMobilePanels(false);
  requestAnimationFrame(positionMobileZoomBelowSummary);
});

/*** AUTO-REFRESH ***/
function start() {
  setStatus();
  initializeStatusSummary();
  buildMobileLegend();
  buildMobileLayers();
loadContracts();
  loadSubs();
  loadNOAAAlerts();
  loadNHCForecasts();

  setInterval(loadNOAAAlerts, 5 * 60 * 1000);          // alerts every 5 min
  setInterval(loadNHCForecasts, 5 * 60 * 1000);        // NHC cones/tracks every 5 min
  setInterval(() => { loadContracts(); loadSubs(); }, 2 * 60 * 1000); // sheets every 2 min
}

start();
