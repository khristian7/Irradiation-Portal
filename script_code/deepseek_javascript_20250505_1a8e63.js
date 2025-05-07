"use strict";

(() => {
  // Constants
  const DATE_FORMAT = "Y-m-d";
  const DEFAULT_MAP_VIEW = [0.31166, 32.5974];
  const CHART_COLORS = {
    primary: "#4e73df",
    secondary: "rgba(78, 115, 223, 0.15)",
    error: "#dc3545"
  };

  // State Management
  const state = {
    map: null,
    marker: null,
    chart: null,
    elements: {
      latitude: document.getElementById("latitudeInput"),
      longitude: document.getElementById("longitudeInput"),
      startDate: document.getElementById("startDate"),
      endDate: document.getElementById("endDate"),
      dataSource: document.getElementById("dataSource"),
      selectedCoords: document.getElementById("selectedCoords"),
      searchInput: document.getElementById("searchInput"),
      tiltAngle: document.getElementById("tiltangle"),
      visualizeBtn: document.getElementById("visualizeBtn"),
      downloadBtn: document.getElementById("downloadBtn"),
      errorContainer: document.getElementById("errorContainer")
    }
  };

  // Initialization
  document.addEventListener("DOMContentLoaded", () => {
    initializeMap();
    initializeChart();
    initializeDatePickers();
    setupEventListeners();
    setupUIComponents();
    validateControls();
  });

  // Map Functions
  function initializeMap() {
    state.map = L.map("map").setView(DEFAULT_MAP_VIEW, 8);
    
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    setupMapEvents();
  }

  function setupMapEvents() {
    const coordsEl = document.getElementById("cursorCoords");
    
    state.map
      .on("mousemove", throttle(100, e => {
        coordsEl.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      }))
      .on("click", e => {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);
        
        state.elements.latitude.value = lat;
        state.elements.longitude.value = lng;
        state.elements.selectedCoords.textContent = `${lat}, ${lng}`;
        
        updateMapMarker(e.latlng);
        validateControls();
      });
  }

  function updateMapMarker(latlng) {
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.marker(latlng).addTo(state.map);
  }

  // Chart Functions
  function initializeChart() {
    const ctx = document.getElementById("irradianceChart").getContext("2d");
    state.chart = new Chart(ctx, getChartConfig());
  }

  function getChartConfig() {
    return {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Solar Irradiance Data" },
          legend: { position: "top" }
        },
        scales: {
          x: { type: "time", title: { text: "Date" } },
          y: { 
            beginAtZero: true,
            title: { text: "Irradiance (W/m²)" }
          }
        }
      }
    };
  }

  // UI Components
  function setupUIComponents() {
    setupTiltAngleToggle();
    setupTimeRangeSelection();
  }

  function setupTiltAngleToggle() {
    const toggleField = () => {
      document.querySelector(".tilt-angle-field").style.display = 
        document.getElementById("gti").checked ? "block" : "none";
      validateControls();
    };
    
    document.getElementById("gti").addEventListener("change", toggleField);
    toggleField();
  }

  function setupTimeRangeSelection() {
    const updateMode = () => {
      const mode = document.querySelector('input[name="timeRangeType"]:checked').value;
      document.getElementById("dateRangeFields").style.display = 
        mode === "date" ? "block" : "none";
      document.getElementById("yearRangeFields").style.display = 
        mode === "year" ? "block" : "none";
      validateControls();
    };
    
    document.querySelectorAll('input[name="timeRangeType"]').forEach(radio => 
      radio.addEventListener("change", updateMode)
    );
    updateMode();
  }

  // Event Handling
  function setupEventListeners() {
    // Search
    document.getElementById("searchBtn").addEventListener("click", handleSearch);
    state.elements.searchInput.addEventListener("keypress", e => 
      e.key === "Enter" && handleSearch()
    );

    // Main Actions
    document.getElementById("visualizeBtn").addEventListener("click", handleVisualization);
    document.getElementById("downloadBtn").addEventListener("click", handleDownload);
    document.getElementById("cancelBtn").addEventListener("click", resetApplication);
    
    // Input Validation
    document.querySelectorAll("[data-validate]").forEach(el => 
      el.addEventListener("input", validateControls)
    );
  }

  // Validation
  function validateControls() {
    const { valid } = validateInputs();
    state.elements.visualizeBtn.disabled = !valid;
    state.elements.downloadBtn.disabled = !valid;
  }

  function validateInputs() {
    const errors = [];
    const lat = parseFloat(state.elements.latitude.value);
    const lon = parseFloat(state.elements.longitude.value);

    // Coordinate validation
    if (isNaN(lat) || lat < -90 || lat > 90) errors.push("Invalid latitude");
    if (isNaN(lon) || lon < -180 || lon > 180) errors.push("Invalid longitude");

    // Data source validation
    if (!state.elements.dataSource.value) errors.push("Select data source");

    // Time range validation
    const mode = document.querySelector('input[name="timeRangeType"]:checked').value;
    if (mode === "date") {
      if (!state.elements.startDate.value) errors.push("Missing start date");
      if (!state.elements.endDate.value) errors.push("Missing end date");
      if (state.elements.startDate.value > state.elements.endDate.value) {
        errors.push("Start date after end date");
      }
    } else {
      const startYear = parseInt(document.getElementById("startYear").value);
      const endYear = parseInt(document.getElementById("endYear").value);
      if (isNaN(startYear) || isNaN(endYear)) errors.push("Invalid year range");
      if (startYear > endYear) errors.push("Start year after end year");
    }

    return { valid: errors.length === 0, message: errors.join("\n") };
  }

  // Data Handling
  async function handleVisualization() {
    if (!validateInputs().valid) return showError("Fix form errors");
    
    try {
      toggleLoading(state.elements.visualizeBtn, true);
      const params = getFormData();
      const response = await fetchData(getEndpoint(params.dataSource), params);
      
      if (params.plot_mode === "date") {
        updateTimeSeriesChart(response.data, params.timeGranularity);
      } else {
        drawAverageChart(response.data);
      }
      updateSummary(params);
    } catch (error) {
      showError(error.message);
    } finally {
      toggleLoading(state.elements.visualizeBtn, false);
    }
  }

  // Utility Functions
  function throttle(delay, fn) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall < delay) return;
      lastCall = now;
      return fn(...args);
    };
  }

  function toggleLoading(element, isLoading, text = "Processing...") {
    if (isLoading) {
      element.disabled = true;
      element.innerHTML = `<span class="spinner"></span> ${text}`;
    } else {
      element.disabled = false;
      element.innerHTML = element.dataset.originalText;
    }
  }

  function showError(message) {
    state.elements.errorContainer.textContent = message;
    state.elements.errorContainer.classList.add("visible");
    setTimeout(() => 
      state.elements.errorContainer.classList.remove("visible"), 5000);
  }

  // Remaining helper functions would follow similar patterns
  // ... (fetchData, updateTimeSeriesChart, etc.)
})();