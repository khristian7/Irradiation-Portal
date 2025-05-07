"use strict";

(() => {
  // State
  const state = {
    map: null,
    marker: null,
    chart: null,
    startPicker: null,
    endPicker: null,
  };

  // Wait for DOM
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    initMap();
    initPickers();
    initChart();
    bindEvents();
    toggleTimeFields();
    toggleTiltField();
    validateControls();
  }

  // Initialize Leaflet map
  function initMap() {
    state.map = L.map("map").setView([0.31166, 32.5974], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
    }).addTo(state.map);

    const coordsEl = document.getElementById("cursorCoords");
    state.map.on("mousemove", (e) => {
      coordsEl.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    });

    state.map.on("click", (e) => {
      const lat = e.latlng.lat.toFixed(4);
      const lng = e.latlng.lng.toFixed(4);
      document.getElementById("latitudeInput").value = lat;
      document.getElementById("longitudeInput").value = lng;
      document.getElementById("selectedCoords").textContent = `${lat}, ${lng}`;
      if (state.marker) state.map.removeLayer(state.marker);
      state.marker = L.marker(e.latlng).addTo(state.map);
      validateControls();
    });
  }

  // Initialize Flatpickr date pickers
  function initPickers() {
    state.startPicker = flatpickr("#startDate", { dateFormat: "Y-m-d" });
    state.endPicker = flatpickr("#endDate", { dateFormat: "Y-m-d" });
  }

  // Initialize Chart.js
  function initChart() {
    const ctx = document.getElementById("irradianceChart").getContext("2d");
    const cfg = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Irradiance (W/m²)", data: [], tension: 0.4, fill: true },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top" } },
        scales: {
          x: {
            type: "time",
            time: { unit: "day", displayFormats: { day: "MMM d" } },
            title: { display: true, text: "Date" },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Irradiance (W/m²)" },
          },
        },
      },
    };
    state.chart = new Chart(ctx, cfg);
  }

  // Bind UI events
  function bindEvents() {
    const $ = (id) => document.getElementById(id);
    $("#searchBtn").addEventListener("click", onSearch);
    $("#searchInput").addEventListener(
      "keypress",
      (e) => e.key === "Enter" && onSearch(),
    );
    $("#visualizeBtn").addEventListener("click", onVisualize);
    $("#downloadBtn").addEventListener("click", onDownload);
    $("#cancelBtn").addEventListener("click", resetForm);
    $("#downloadPdfBtn").addEventListener("click", onDownloadChart);

    document
      .querySelectorAll('input[name="timeRangeType"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          toggleTimeFields();
          validateControls();
        });
      });

    document.querySelectorAll(".form-control, input, select").forEach((el) =>
      el.addEventListener("change", () => {
        toggleTiltField();
        validateControls();
      }),
    );
  }

  // Show/hide date vs year fields
  function toggleTimeFields() {
    const isDate = document.getElementById("date").checked;
    document.getElementById("dateRangeFields").style.display = isDate
      ? "block"
      : "none";
    document.getElementById("yearRangeFields").style.display = isDate
      ? "none"
      : "block";
  }

  // Show/hide tilt angle field
  function toggleTiltField() {
    const tiltField = document.querySelector(".tilt-angle-field");
    tiltField.style.display = document.getElementById("gti")?.checked
      ? "block"
      : "none";
  }

  // Enable/disable buttons based on validation
  function validateControls() {
    const { valid } = validateInputs();
    document.getElementById("visualizeBtn").disabled = !valid;
    document.getElementById("downloadBtn").disabled = !valid;
  }

  // Validate form inputs
  function validateInputs() {
    const lat = parseFloat(document.getElementById("latitudeInput").value);
    const lon = parseFloat(document.getElementById("longitudeInput").value);
    const ds = document.getElementById("dataSource").value;
    const plotMode = document.querySelector(
      'input[name="timeRangeType"]:checked',
    ).value;
    const errs = [];

    if (isNaN(lat) || lat < -90 || lat > 90) errs.push("Latitude out of range");
    if (isNaN(lon) || lon < -180 || lon > 180)
      errs.push("Longitude out of range");

    if (plotMode === "date") {
      const start = document.getElementById("startDate").value;
      const end = document.getElementById("endDate").value;
      if (!start) errs.push("Start date missing");
      if (!end) errs.push("End date missing");
      if (start && end && new Date(start) > new Date(end))
        errs.push("Start date after end date");
    } else {
      const sy = parseInt(document.getElementById("startYear").value, 10);
      const ey = parseInt(document.getElementById("endYear").value, 10);
      if (isNaN(sy)) errs.push("Start year missing");
      if (isNaN(ey)) errs.push("End year missing");
      if (!isNaN(sy) && !isNaN(ey) && sy > ey)
        errs.push("Start year greater than end year");
    }

    if (!ds) errs.push("Select data source");
    return { valid: errs.length === 0, message: errs.join("\n") };
  }

  // Search location via Nominatim
  async function onSearch() {
    const q = document.getElementById("searchInput").value.trim();
    if (!q) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) throw new Error(res.statusText);
      const [first] = await res.json();
      if (!first) return showError("Location not found");
      const lat = +first.lat,
        lon = +first.lon;
      state.map.setView([lat, lon], 13);
      document.getElementById("latitudeInput").value = lat.toFixed(4);
      document.getElementById("longitudeInput").value = lon.toFixed(4);
      document.getElementById("selectedCoords").textContent =
        `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      if (state.marker) state.map.removeLayer(state.marker);
      state.marker = L.marker([lat, lon]).addTo(state.map);
      validateControls();
    } catch (err) {
      console.error(err);
      showError(`Search failed: ${err.message}`);
    }
  }

  // Visualize data
  async function onVisualize() {
    const { valid, message } = validateInputs();
    if (!valid) return showError(message);
    const btn = document.getElementById("visualizeBtn");
    toggleLoading(btn, true, "Processing...");
    try {
      const params = getFormData();
      const endpoint = getEndpoint(params.dataSource);
      const res = await fetch(endpoint, postOpts(params));
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const result = await res.json();
      processData(result.data, params);
    } catch (err) {
      console.error(err);
      showError(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  }

  // Download raw data
  async function onDownload() {
    const { valid, message } = validateInputs();
    if (!valid) return showError(message);
    const btn = document.getElementById("downloadBtn");
    toggleLoading(btn, true, "Preparing...");
    try {
      const params = getFormData();
      const fmt = document.querySelector(
        'input[name="outputFormat"]:checked',
      ).value;
      const res = await fetch(`/api/export?format=${fmt}`, postOpts(params));
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      downloadBlob(
        blob,
        `solar_data_${params.dataSource}_${getDateStamp()}.${fmt.toLowerCase()}`,
      );
    } catch (err) {
      console.error(err);
      showError(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  }

  // Download chart as PNG
  function onDownloadChart() {
    if (!state.chart.data.labels.length)
      return showError("Generate chart first");
    const link = document.createElement("a");
    link.href = document.getElementById("irradianceChart").toDataURL();
    link.download = `solar_chart_${getDateStamp()}.png`;
    link.click();
  }

  // Collect form data
  function getFormData() {
    const lat = parseFloat(document.getElementById("latitudeInput").value);
    const lon = parseFloat(document.getElementById("longitudeInput").value);
    const timeGran = document.querySelector(
      'input[name="Temporal Resolution"]:checked',
    ).value;
    const source = document.getElementById("dataSource").value;
    const plotMode = document.querySelector(
      'input[name="timeRangeType"]:checked',
    ).value;
    const params = {
      latitude: lat,
      longitude: lon,
      dataSource: source,
      timeGranularity: timeGran,
      plot_mode: plotMode,
    };
    if (plotMode === "date") {
      params.startDate = document.getElementById("startDate").value;
      params.endDate = document.getElementById("endDate").value;
    } else {
      params.startYear = parseInt(
        document.getElementById("startYear").value,
        10,
      );
      params.endYear = parseInt(document.getElementById("endYear").value, 10);
    }
    if (document.getElementById("gti")?.checked) {
      const tilt = parseFloat(document.getElementById("tiltangle").value);
      if (!isNaN(tilt)) params.tiltAngle = tilt;
    }
    return params;
  }

  // Determine endpoint
  function getEndpoint(source) {
    return source === "model"
      ? "/api/model"
      : source === "CAMS_RAD"
        ? "/api/cams"
        : "/api/nasa";
  }

  function postOpts(body) {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  // Process API data
  function processData(data, params) {
    if (params.plot_mode === "date") updateChart(data, params.timeGranularity);
    else drawAverage(data, params.startYear, params.endYear);
    updateSummary(params);
  }

  // Standard line plot
  function updateChart(points, gran) {
    if (!points.length) return clearChart("No data");
    const unitMap = { Hourly: "hour", Daily: "day", Monthly: "month" };
    const labels =
      gran === "Monthly"
        ? points.map((p) => new Date(p.year, p.month - 1, 1))
        : points.map((p) => new Date(p.datetime));
    const values = points.map((p) => p.irradiance);
    state.chart.data.labels = labels;
    state.chart.data.datasets = [
      {
        label: `${gran} Irradiance (W/m²)`,
        data: values,
        tension: 0.4,
        fill: true,
      },
    ];
    state.chart.options.scales.x.time.unit = unitMap[gran] || "day";
    state.chart.update();
  }

  // Average + STD plot for year ranges
  function drawAverage(data, startY, endY) {
    const groups = {};
    data.forEach((d) => {
      const dt = new Date(d.datetime || d.date);
      const fy = dt.getFullYear();
      if (fy < startY || fy > endY) return;
      const key = `${dt.getMonth() + 1}-${dt.getDate()}`;
      (groups[key] = groups[key] || []).push(d.irradiance);
    });
    const keys = Object.keys(groups).sort(
      (a, b) => new Date(`2020-${a}`) - new Date(`2020-${b}`),
    );
    const avgs = keys.map((k) => mean(groups[k]));
    const stds = keys.map((k, i) => std(groups[k], avgs[i]));
    const upper = avgs.map((v, i) => v + stds[i]);
    const lower = avgs.map((v, i) => v - stds[i]);
    state.chart.data.labels = keys;
    state.chart.data.datasets = [
      { label: "Average Irradiance (W/m²)", data: avgs, fill: false },
      { label: "+1 STD", data: upper, fill: "+1" },
      { label: "-1 STD", data: lower, fill: false },
    ];
    state.chart.options.scales.x.type = "category";
    state.chart.options.scales.y.suggestedMin = Math.min(...lower);
    state.chart.options.scales.y.suggestedMax = Math.max(...upper);
    state.chart.update();
  }

  function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  function std(arr, m) {
    return Math.sqrt(
      arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length,
    );
  }

  // Summary card update
  function updateSummary(p) {
    const def = "N/A";
    document.querySelector(".badge-latitude").textContent = p
      ? p.latitude.toFixed(4) + "°"
      : def;
    document.querySelector(".badge-longitude").textContent = p
      ? p.longitude.toFixed(4) + "°"
      : def;
    document.querySelector(".text-granularity").textContent =
      p?.timeGranularity || def;
    const fmtDate = (d) =>
      new Date(d + "T00:00:00Z").toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    if (p.plot_mode === "date") {
      document.querySelector(".text-start-date").textContent = p
        ? fmtDate(p.startDate)
        : def;
      document.querySelector(".text-end-date").textContent = p
        ? fmtDate(p.endDate)
        : def;
    } else {
      document.querySelector(".text-start-date").textContent = p
        ? p.startYear
        : def;
      document.querySelector(".text-end-date").textContent = p
        ? p.endYear
        : def;
    }
    document.querySelector(".text-data-source").textContent = p
      ? document.querySelector(`#dataSource option[value="${p.dataSource}"]`)
          .textContent
      : def;
    document.querySelector(".summary-update-time").textContent =
      `Last updated: ${new Date().toLocaleString()}`;
  }

  // Clear chart
  function clearChart(msg) {
    state.chart.data.labels = [];
    state.chart.data.datasets = [];
    if (state.chart.options.plugins.title) {
      state.chart.options.plugins.title.display = true;
      state.chart.options.plugins.title.text = msg;
    }
    state.chart.update();
  }

  // Loading spinner
  function toggleLoading(btn, loading, text) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.orig = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span> ${text}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.orig;
    }
  }

  // Error alert
  function showError(msg) {
    alert(msg);
  }

  // Reset form
  function resetForm() {
    document.querySelector("form").reset();
    if (state.marker) state.map.removeLayer(state.marker);
    state.chart.data.labels = [];
    state.chart.data.datasets = [];
    state.chart.update();
    toggleTimeFields();
    toggleTiltField();
    validateControls();
  }

  function getDateStamp() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
