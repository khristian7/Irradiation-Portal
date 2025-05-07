"use strict";

(() => {
  // Constants
  const API_ENDPOINTS = {
    MODEL: "/api/model",
    CAMS_RAD: "/api/cams",
    NASA: "/api/nasa"
  };
  const UNITS = {
    IRRADIANCE: "W/m²",
    DEGREES: "°"
  };
  const DATE_FORMAT = "Y-m-d";

  // State
  const state = {
    map: null,
    marker: null,
    chart: null,
    startPicker: null,
    endPicker: null,
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

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    initMap();
    initPickers();
    initChart();
    bindEvents();
    toggleTiltField();
    validateControls();
  }

  function initMap() {
    state.map = L.map("map").setView([0.31166, 32.5974], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(state.map);

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
        
        if (state.marker) state.map.removeLayer(state.marker);
        state.marker = L.marker(e.latlng).addTo(state.map);
        validateControls();
      });
  }

  function initPickers() {
    state.startPicker = flatpickr("#startDate", { dateFormat: DATE_FORMAT });
    state.endPicker = flatpickr("#endDate", { dateFormat: DATE_FORMAT });
  }

  function initChart() {
    const ctx = document.getElementById("irradianceChart").getContext("2d");
    state.chart = new Chart(ctx, getChartConfig());
  }

  function bindEvents() {
    const { elements } = state;
    elements.searchInput.addEventListener("keypress", e => e.key === "Enter" && onSearch());
    document.getElementById("searchBtn").addEventListener("click", onSearch);
    document.getElementById("visualizeBtn").addEventListener("click", onVisualize);
    document.getElementById("downloadBtn").addEventListener("click", onDownload);
    document.getElementById("cancelBtn").addEventListener("click", resetForm);
    document.getElementById("downloadPdfBtn").addEventListener("click", onDownloadChart);

    // Unified event delegation
    document.querySelectorAll("[data-validate]").forEach(el => 
      el.addEventListener("change", () => {
        toggleTiltField();
        validateControls();
      })
    );
  }

  async function onSearch() {
    const query = state.elements.searchInput.value.trim();
    if (!query) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      if (!data.length) return showError("Location not found");
      
      const [result] = data;
      updateMapPosition(result.lat, result.lon);
      validateControls();
    } catch (error) {
      showError(`Search failed: ${error.message}`);
    }
  }

  async function onVisualize() {
    if (!validateInputs().valid) return;
    
    try {
      const params = getFormData();
      toggleLoading(state.elements.visualizeBtn, true, "Processing...");
      
      const response = await fetchData(
        getEndpoint(params.dataSource), 
        params
      );
      
      processData(response.data, params);
      updateSummary(params);
    } catch (error) {
      showError(error.message);
    } finally {
      toggleLoading(state.elements.visualizeBtn, false);
    }
  }

  // Improved helper functions
  function getChartConfig() {
    return {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: `Irradiance (${UNITS.IRRADIANCE})`,
          data: [],
          tension: 0.4,
          fill: true,
          borderColor: "#4CAF50"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Solar Irradiance Over Time" },
          legend: { position: "top" }
        },
        scales: {
          x: { 
            type: "time",
            time: { unit: "day", tooltipFormat: "MMM d, yyyy" },
            title: { display: true, text: "Date" }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: `Irradiance (${UNITS.IRRADIANCE})` }
          }
        }
      }
    };
  }

  function updateMapPosition(lat, lon) {
    state.map.setView([lat, lon], 13);
    state.elements.latitude.value = Number(lat).toFixed(4);
    state.elements.longitude.value = Number(lon).toFixed(4);
    
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.marker([lat, lon]).addTo(state.map);
  }

  async function fetchData(endpoint, params) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || "Request failed");
    }
    
    return response.json();
  }

  // Throttle function for mousemove events
  function throttle(delay, fn) {
    let lastCall = 0;
    return (...args) => {
      const now = new Date().getTime();
      if (now - lastCall < delay) return;
      lastCall = now;
      return fn(...args);
    };
  }

  // Improved error handling
  function showError(message) {
    state.elements.errorContainer.textContent = message;
    state.elements.errorContainer.classList.remove("d-none");
    setTimeout(() => state.elements.errorContainer.classList.add("d-none"), 5000);
  }

  // Remaining helper functions adjusted to use state.elements
  // ... (other functions updated similarly to use centralized element references)
})();