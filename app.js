const mapSvg = document.querySelector("#provinceMap");
const tooltip = document.querySelector("#mapTooltip");
const datePicker = document.querySelector("#datePicker");
const dateRange = document.querySelector("#dateRange");
const hourRange = document.querySelector("#hourRange");
const hourChips = document.querySelector("#hourChips");
const prevDayButton = document.querySelector("#prevDay");
const nextDayButton = document.querySelector("#nextDay");
const activeDateLabel = document.querySelector("#activeDateLabel");
const activeTimeLabel = document.querySelector("#activeTimeLabel");
const avgPm25 = document.querySelector("#avgPm25");
const highestProvince = document.querySelector("#highestProvince");
const highestValue = document.querySelector("#highestValue");
const detailProvince = document.querySelector("#detailProvince");
const detailTime = document.querySelector("#detailTime");
const detailPm25 = document.querySelector("#detailPm25");
const detailLevel = document.querySelector("#detailLevel");
const detailAqi = document.querySelector("#detailAqi");
const detailTemp = document.querySelector("#detailTemp");
const detailHumidity = document.querySelector("#detailHumidity");
const detailWind = document.querySelector("#detailWind");
const hourlyProvince = document.querySelector("#hourlyProvince");
const hourlyBars = document.querySelector("#hourlyBars");
const provinceRows = document.querySelector("#provinceRows");
const recordCount = document.querySelector("#recordCount");

const VIEWBOX = { width: 1000, height: 780, pad: 24 };
const RISK_LEVELS = [
  { max: 15, level: "ดีมาก", key: "blue", color: "#4aa8ff" },
  { max: 25, level: "ดี", key: "green", color: "#22b573" },
  { max: 37.5, level: "ปานกลาง", key: "yellow", color: "#f3c74d" },
  { max: 75, level: "เริ่มมีผลกระทบ", key: "orange", color: "#f08a35" },
  { max: Infinity, level: "มีผลกระทบมาก", key: "red", color: "#d94b4b" },
];

const thaiFormatter = new Intl.DateTimeFormat("th-TH", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const numberFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

let geojson = null;
let forecastPayload = null;
let forecastsBySlot = new Map();
let forecastsByDate = new Map();
let provinceByCode = new Map();
let monthIndexByKey = new Map();
let loadedMonths = new Map();
let loadingMonths = new Map();
let dates = [];
let activeDate = "";
let activeHour = 7;
let selectedProvinceCode = "";
let provincePaths = new Map();
let hoveredProvinceCode = "";
let dateLoadSequence = 0;

init();

async function init() {
  try {
    const [loadedGeojson, loadedForecastPayload] = await Promise.all([
      fetchJsonFromCandidates(["data/northern-thailand.geojson", "northern-thailand.geojson"]),
      fetchJsonFromCandidates(["data/forecast_index.json", "forecast_index.json"]),
    ]);

    geojson = loadedGeojson;
    forecastPayload = loadedForecastPayload;
    provinceByCode = new Map(forecastPayload.metadata.provinces.map((province) => [province.code, province]));
    initializeForecastIndex();
    setupControls();
    renderMap();
    activeHour = forecastPayload.metadata.default_hour ?? 7;
    await setActiveDate(forecastPayload.metadata.start_date);
  } catch (error) {
    showLoadError(error);
  }
}

function initializeForecastIndex() {
  forecastsBySlot = new Map();
  forecastsByDate = new Map();
  loadedMonths = new Map();
  loadingMonths = new Map();
  monthIndexByKey = new Map(forecastPayload.months.map((month) => [month.key, month]));
  dates = buildDateList(forecastPayload.metadata.start_date, forecastPayload.metadata.end_date);
}

function addForecastRecords(records) {
  records.map(hydrateRecord).forEach((record) => {
    const slotKey = getSlotKey(record.date, record.hour);
    if (!forecastsBySlot.has(slotKey)) {
      forecastsBySlot.set(slotKey, []);
    }
    forecastsBySlot.get(slotKey).push(record);

    if (!forecastsByDate.has(record.date)) {
      forecastsByDate.set(record.date, []);
    }
    forecastsByDate.get(record.date).push(record);
  });
}

function setupControls() {
  const { start_date: startDate, end_date: endDate } = forecastPayload.metadata;
  datePicker.min = startDate;
  datePicker.max = endDate;
  datePicker.value = startDate;
  dateRange.min = 0;
  dateRange.max = dates.length - 1;
  dateRange.value = 0;
  hourRange.min = 0;
  hourRange.max = 23;
  hourRange.value = forecastPayload.metadata.default_hour ?? 7;

  datePicker.addEventListener("change", () => setActiveDate(datePicker.value));
  dateRange.addEventListener("input", () => setActiveDate(dates[Number(dateRange.value)]));
  hourRange.addEventListener("input", () => setActiveHour(Number(hourRange.value)));
  prevDayButton.addEventListener("click", () => stepDate(-1));
  nextDayButton.addEventListener("click", () => stepDate(1));
  window.addEventListener("resize", () => positionTooltip(null));
}

function stepDate(delta) {
  const currentIndex = dates.indexOf(activeDate);
  const nextIndex = Math.max(0, Math.min(dates.length - 1, currentIndex + delta));
  setActiveDate(dates[nextIndex]);
}

function renderMap() {
  mapSvg.replaceChildren();
  provincePaths = new Map();
  const projection = createProjection(geojson);

  geojson.features.forEach((feature) => {
    const code = feature.properties.province_code;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", geometryToPath(feature.geometry, projection));
    path.setAttribute("class", "province-path");
    path.setAttribute("fill-rule", "evenodd");
    path.dataset.code = code;
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute("aria-label", feature.properties.name_th);

    path.addEventListener("click", () => selectProvince(code));
    path.addEventListener("focus", () => selectProvince(code));
    path.addEventListener("mouseenter", () => {
      hoveredProvinceCode = code;
      path.classList.add("is-hovered");
    });
    path.addEventListener("mousemove", (event) => showTooltip(event, code));
    path.addEventListener("mouseleave", () => {
      hoveredProvinceCode = "";
      path.classList.remove("is-hovered");
      positionTooltip(null);
    });
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectProvince(code);
      }
    });

    provincePaths.set(code, path);
    mapSvg.append(path);
  });

  geojson.features.forEach((feature) => {
    const labelPoint = getFeatureLabelPoint(feature, projection);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", labelPoint.x);
    text.setAttribute("y", labelPoint.y);
    text.setAttribute("class", "province-label");
    text.textContent = feature.properties.name_th;
    mapSvg.append(text);
  });
}

function createProjection(collection) {
  const bounds = getBounds(collection);
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  const innerWidth = VIEWBOX.width - VIEWBOX.pad * 2;
  const innerHeight = VIEWBOX.height - VIEWBOX.pad * 2;
  const scale = Math.min(innerWidth / lonSpan, innerHeight / latSpan);
  const renderedWidth = lonSpan * scale;
  const renderedHeight = latSpan * scale;
  const offsetX = (VIEWBOX.width - renderedWidth) / 2;
  const offsetY = (VIEWBOX.height - renderedHeight) / 2;

  return ([lon, lat]) => ({
    x: offsetX + (lon - bounds.minLon) * scale,
    y: offsetY + (bounds.maxLat - lat) * scale,
  });
}

function getBounds(collection) {
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };

  collection.features.forEach((feature) => {
    walkCoordinates(feature.geometry.coordinates, ([lon, lat]) => {
      bounds.minLon = Math.min(bounds.minLon, lon);
      bounds.minLat = Math.min(bounds.minLat, lat);
      bounds.maxLon = Math.max(bounds.maxLon, lon);
      bounds.maxLat = Math.max(bounds.maxLat, lat);
    });
  });

  return bounds;
}

function walkCoordinates(node, visit) {
  if (typeof node[0] === "number") {
    visit(node);
    return;
  }
  node.forEach((child) => walkCoordinates(child, visit));
}

function geometryToPath(geometry, project) {
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates, project);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygonToPath(polygon, project)).join(" ");
  }
  return "";
}

function polygonToPath(polygon, project) {
  return polygon
    .map((ring) => {
      const points = ring.map((coordinate) => {
        const { x, y } = project(coordinate);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });
      return `M${points.join("L")}Z`;
    })
    .join(" ");
}

function getFeatureLabelPoint(feature, project) {
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };
  walkCoordinates(feature.geometry.coordinates, ([lon, lat]) => {
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });
  return project([(bounds.minLon + bounds.maxLon) / 2, (bounds.minLat + bounds.maxLat) / 2]);
}

async function setActiveDate(date) {
  if (!dates.includes(date)) {
    return;
  }

  activeDate = date;
  const sequence = ++dateLoadSequence;
  const dateIndex = dates.indexOf(date);
  datePicker.value = date;
  dateRange.value = dateIndex;
  prevDayButton.disabled = dateIndex === 0;
  nextDayButton.disabled = dateIndex === dates.length - 1;
  setLoadingState(date);

  try {
    await ensureMonthLoaded(date);
    if (sequence !== dateLoadSequence) {
      return;
    }
    renderActiveSlot();
    prefetchNearbyMonth(date);
  } catch (error) {
    showLoadError(error);
  }
}

function setLoadingState(date) {
  activeDateLabel.textContent = thaiFormatter.format(new Date(`${date}T${padHour(activeHour)}:00:00+07:00`));
  activeTimeLabel.textContent = `กำลังโหลดข้อมูลเดือน ${getMonthKey(date)}...`;
}

async function ensureMonthLoaded(date) {
  const key = getMonthKey(date);
  if (loadedMonths.has(key)) {
    return;
  }
  if (loadingMonths.has(key)) {
    await loadingMonths.get(key);
    return;
  }

  const month = monthIndexByKey.get(key);
  if (!month) {
    throw new Error(`Missing forecast month: ${key}`);
  }

  const loadPromise = fetchMonth(month);
  loadingMonths.set(key, loadPromise);
  try {
    await loadPromise;
  } finally {
    loadingMonths.delete(key);
  }
}

async function fetchMonth(month) {
  const payload = await fetchJsonFromCandidates(getMonthCandidatePaths(month));
  if (!loadedMonths.has(month.key)) {
    addForecastRecords(payload.records);
    loadedMonths.set(month.key, payload);
  }
}

function prefetchNearbyMonth(date) {
  const currentIndex = forecastPayload.months.findIndex((month) => month.key === getMonthKey(date));
  const nextMonth = forecastPayload.months[currentIndex + 1];
  if (nextMonth && !loadedMonths.has(nextMonth.key) && !loadingMonths.has(nextMonth.key)) {
    const loadPromise = fetchMonth(nextMonth).catch(() => {});
    loadingMonths.set(nextMonth.key, loadPromise);
    loadPromise.finally(() => loadingMonths.delete(nextMonth.key));
  }
}

function setActiveHour(hour) {
  activeHour = Math.max(0, Math.min(23, hour));
  hourRange.value = activeHour;
  renderActiveSlot();
}

function renderActiveSlot() {
  const records = getActiveRecords();
  if (!records.length) {
    return;
  }

  const sortedRecords = [...records].sort((a, b) => b.pm25 - a.pm25);
  const maxRecord = sortedRecords[0];
  const selectedExists = sortedRecords.some((record) => record.province_code === selectedProvinceCode);
  if (!selectedExists) {
    selectedProvinceCode = maxRecord.province_code;
  }

  activeDateLabel.textContent = thaiFormatter.format(new Date(`${activeDate}T${padHour(activeHour)}:00:00+07:00`));
  activeTimeLabel.textContent = `เวลา ${padHour(activeHour)}:00 น. | รายชั่วโมง`;

  updateMap(sortedRecords);
  updateSummary(sortedRecords);
  updateDetail(sortedRecords.find((record) => record.province_code === selectedProvinceCode));
  updateRanking(sortedRecords);
  updateHourChips();
  updateHourlyBars();
}

function getActiveRecords() {
  return forecastsBySlot.get(getSlotKey(activeDate, activeHour)) ?? [];
}

function getSlotKey(date, hour) {
  return `${date}|${Number(hour)}`;
}

function updateMap(records) {
  const recordMap = new Map(records.map((record) => [record.province_code, record]));
  provincePaths.forEach((path, code) => {
    const record = recordMap.get(code);
    path.style.fill = record ? record.color : "#d9ded7";
    path.classList.toggle("is-selected", code === selectedProvinceCode);
    path.classList.toggle("is-hovered", code === hoveredProvinceCode);
    path.setAttribute(
      "aria-label",
      record ? `${getProvinceName(record)} PM2.5 ${record.pm25} ${record.level} เวลา ${formatHour(record.hour)}` : code,
    );
  });
}

function updateSummary(records) {
  const average = records.reduce((sum, record) => sum + record.pm25, 0) / records.length;
  const highest = records[0];
  avgPm25.textContent = numberFormatter.format(average);
  highestProvince.textContent = getProvinceName(highest);
  highestValue.textContent = `${numberFormatter.format(highest.pm25)} µg/m³`;
  recordCount.textContent = `${records.length} จังหวัด | ${padHour(activeHour)}:00`;
}

function updateDetail(record) {
  if (!record) {
    return;
  }

  detailProvince.textContent = getProvinceName(record);
  detailTime.textContent = `${thaiFormatter.format(new Date(`${record.date}T${padHour(record.hour)}:00:00+07:00`))} เวลา ${formatHour(record.hour)} น.`;
  detailPm25.textContent = numberFormatter.format(record.pm25);
  detailLevel.textContent = record.level;
  detailLevel.style.background = record.color;
  detailAqi.textContent = record.aqi_estimate;
  detailTemp.textContent = `${numberFormatter.format(record.weather.temperature)} °C`;
  detailHumidity.textContent = `${numberFormatter.format(record.weather.humidity)}%`;
  detailWind.textContent = `${numberFormatter.format(record.weather.wind_speed)} m/s`;
  document.documentElement.style.setProperty("--active-risk", record.color);
}

function updateHourChips() {
  hourChips.replaceChildren();
  for (let hour = 0; hour < 24; hour += 1) {
    const records = forecastsBySlot.get(getSlotKey(activeDate, hour)) ?? [];
    const average = records.reduce((sum, record) => sum + record.pm25, 0) / Math.max(1, records.length);
    const level = classifyAverage(average);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hour-chip";
    button.classList.toggle("is-active", hour === activeHour);
    button.style.setProperty("--chip-color", level.color);
    button.innerHTML = `<span>${padHour(hour)}:00</span><strong>${numberFormatter.format(average)}</strong>`;
    button.setAttribute("aria-label", `เลือกเวลา ${padHour(hour)}:00 ค่าเฉลี่ย ${numberFormatter.format(average)}`);
    button.addEventListener("click", () => setActiveHour(hour));
    hourChips.append(button);
  }
}

function updateHourlyBars() {
  const dayRecords = forecastsByDate.get(activeDate) ?? [];
  const selectedRecords = dayRecords
    .filter((record) => record.province_code === selectedProvinceCode)
    .sort((a, b) => a.hour - b.hour);
  const maxPm25 = Math.max(...selectedRecords.map((record) => record.pm25), 1);
  hourlyProvince.textContent = provinceByCode.get(selectedProvinceCode)?.name_th ?? "-";
  hourlyBars.replaceChildren();

  selectedRecords.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hour-bar";
    button.classList.toggle("is-active", record.hour === activeHour);
    button.style.setProperty("--bar-color", record.color);
    button.style.setProperty("--bar-height", `${Math.max(12, (record.pm25 / maxPm25) * 100)}%`);
    button.innerHTML = `<span class="bar-fill"></span><small>${padHour(record.hour)}</small>`;
    button.setAttribute(
      "aria-label",
      `${padHour(record.hour)}:00 PM2.5 ${numberFormatter.format(record.pm25)} ${record.level}`,
    );
    button.addEventListener("click", () => setActiveHour(record.hour));
    hourlyBars.append(button);
  });
}

function updateRanking(records) {
  provinceRows.replaceChildren();
  records.forEach((record) => {
    const row = document.createElement("tr");
    row.classList.toggle("is-selected", record.province_code === selectedProvinceCode);
    row.innerHTML = `
      <td>${getProvinceName(record)}</td>
      <td><strong>${numberFormatter.format(record.pm25)}</strong></td>
      <td>
        <span class="level-cell">
          <span class="level-dot" style="background:${record.color}"></span>
          ${record.level}
        </span>
      </td>
    `;
    row.addEventListener("click", () => selectProvince(record.province_code));
    provinceRows.append(row);
  });
}

function selectProvince(code) {
  selectedProvinceCode = code;
  const records = [...getActiveRecords()].sort((a, b) => b.pm25 - a.pm25);
  updateMap(records);
  updateDetail(records.find((record) => record.province_code === code));
  updateRanking(records);
  updateHourlyBars();
}

function showTooltip(event, code) {
  const record = getActiveRecords().find((item) => item.province_code === code);
  if (!record) {
    return;
  }
  tooltip.style.setProperty("--tooltip-color", record.color);
  tooltip.innerHTML = `
    <div class="tooltip-head">
      <span>${formatHour(record.hour)} น.</span>
      <strong>${getProvinceName(record)}</strong>
    </div>
    <div class="tooltip-reading">
      <b>${numberFormatter.format(record.pm25)}</b>
      <span>µg/m³ PM2.5</span>
    </div>
    <div class="tooltip-meta">
      <span>${record.level}</span>
      <span>AQI ${record.aqi_estimate}</span>
    </div>
  `;
  positionTooltip(event);
}

function positionTooltip(event) {
  if (!event) {
    tooltip.hidden = true;
    return;
  }

  const bounds = document.querySelector(".map-frame").getBoundingClientRect();
  tooltip.hidden = false;
  const left = Math.min(bounds.width - tooltip.offsetWidth - 14, event.clientX - bounds.left + 18);
  const top = Math.min(bounds.height - tooltip.offsetHeight - 14, event.clientY - bounds.top + 18);
  tooltip.style.left = `${Math.max(14, left)}px`;
  tooltip.style.top = `${Math.max(14, top)}px`;
}

function classifyAverage(pm25) {
  return RISK_LEVELS.find((level) => pm25 <= level.max) ?? RISK_LEVELS.at(-1);
}

function padHour(hour) {
  return String(hour).padStart(2, "0");
}

function formatHour(hour) {
  return `${padHour(hour)}:00`;
}

function getProvinceName(recordOrCode) {
  const code = typeof recordOrCode === "string" ? recordOrCode : recordOrCode.province_code;
  return provinceByCode.get(code)?.name_th ?? code;
}

async function fetchJsonFromCandidates(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  for (const path of uniquePaths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Try the next candidate path.
    }
  }
  throw new Error(`Cannot load data from: ${uniquePaths.join(", ")}`);
}

function getMonthCandidatePaths(month) {
  const file = month.file || `${month.key}.json`;
  const filename = file.split("/").pop();
  return [
    `data/${file}`,
    file,
    filename,
    `data/forecasts/${filename}`,
    `forecasts/${filename}`,
  ];
}

function hydrateRecord(record) {
  if (!Array.isArray(record)) {
    const level = record.color ? record : { ...record, ...classifyAverage(record.pm25) };
    return level;
  }

  const [date, hour, provinceCode, pm25, aqiEstimate, rainChance, humidity, windSpeed, temperature, pressure] = record;
  const risk = classifyAverage(pm25);
  return {
    date,
    hour,
    province_code: provinceCode,
    pm25,
    aqi_estimate: aqiEstimate,
    level: risk.level,
    level_key: risk.key,
    color: risk.color,
    weather: {
      rain_chance: rainChance,
      humidity,
      wind_speed: windSpeed,
      temperature,
      pressure,
    },
  };
}

function buildDateList(startDate, endDate) {
  const results = [];
  const current = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  while (current <= end) {
    results.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return results;
}

function parseDateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date) {
  return date.slice(0, 7);
}

function showLoadError(error) {
  console.error(error);
  mapSvg.replaceChildren();
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", VIEWBOX.width / 2);
  text.setAttribute("y", VIEWBOX.height / 2);
  text.setAttribute("class", "empty-state");
  text.textContent = "ไม่สามารถโหลดข้อมูลพยากรณ์ได้";
  mapSvg.append(text);
  activeDateLabel.textContent = "โหลดข้อมูลไม่สำเร็จ";
}
