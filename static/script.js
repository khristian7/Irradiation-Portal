// ----------------------------------MAP section -----------------------------
let map = null;
let clickedMarker = null;
let irradianceChart = null; // Ensure this global variable is used

document.addEventListener("DOMContentLoaded", function () {
  // --- Initialize Map ---
  initializeMap();

  // --- Initialize Chart ---
  initializeChart(); // Sets up the basic chart shell

  // --- Initialize UI Elements & Event Listeners ---
  setupEventListeners();

  // --- Initialize Date Pickers ---
  flatpickr(".datepicker", {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
  });

  // --- Toggle Tilt Angle Field ---
  setupTiltAngleToggle();
});

// --- Initialization Functions ---

function initializeMap() {
  map = L.map("map").setView([0.31166, 32.5974], 8); // Default view

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const cursorCoords = document.getElementById("cursorCoords");
  map.on("mousemove", function (e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    cursorCoords.textContent = `${lat}, ${lng}`;
  });

  map.on("click", function (e) {
    const clickedLat = e.latlng.lat.toFixed(4);
    const clickedLng = e.latlng.lng.toFixed(4);

    document.getElementById("latitudeInput").value = clickedLat;
    document.getElementById("longitudeInput").value = clickedLng;
    document.getElementById("selectedCoords").textContent =
      `${clickedLat}, ${clickedLng}`;

    if (clickedMarker) {
      map.removeLayer(clickedMarker);
    }
    clickedMarker = L.marker(e.latlng).addTo(map);
    validateAndToggleButton();
  });
}

function initializeChart() {
  // This function initializes the chart object with basic configuration.
  // updateChart will be responsible for populating datasets.
  const chartConfig = {
    type: "line",
    data: {
      labels: [],
      datasets: [], // Datasets will be added dynamically by updateChart
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (context) => context[0]?.label || "",
          },
        },
        legend: {
          position: "top",
          display: true, // Ensure legend is displayed
        },
        title: { // Placeholder for potential "No data" message
          display: false,
          text: "",
          padding: {
            top: 10,
            bottom: 10
          }
        }
      },
      scales: {
        x: {
          type: "time",
          time: {
            // unit will be set by updateChart based on granularity
            tooltipFormat: "PPpp", // e.g., Sep 4, 1986, 8:30 PM
            displayFormats: {
              hour: "HH:mm", // e.g., 14:30
              day: "MMM d", // e.g., Sep 4
              month: "MMM yy", // e.g., Sep 86
            },
          },
          title: { display: true, text: "Time" },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: "Irradiance (W/m²)" },
          beginAtZero: true,
        },
      },
    },
  };

  const ctx = document.getElementById("irradianceChart").getContext("2d");
  if (irradianceChart) {
    irradianceChart.destroy();
  }
  irradianceChart = new Chart(ctx, chartConfig);
}

function setupEventListeners() {
  document
    .getElementById("searchBtn")
    .addEventListener("click", searchLocation);
  document
    .getElementById("searchInput")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        searchLocation();
      }
    });

  document
    .getElementById("visualizeBtn")
    .addEventListener("click", handleVisualize);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", handleDownload);
  document.getElementById("cancelBtn").addEventListener("click", resetForm);

  const formInputs = document.querySelectorAll(
    '.form-control, input[type="radio"], input[type="checkbox"], select',
  );
  formInputs.forEach((input) => {
    input.addEventListener("change", validateAndToggleButton);
  });

  validateAndToggleButton();
}

function setupTiltAngleToggle() {
  const gtiCheckbox = document.getElementById("gti");
  const tiltAngleField = document.querySelector(".tilt-angle-field");

  if (!gtiCheckbox || !tiltAngleField) return;

  function toggleTiltField() {
    tiltAngleField.style.display = gtiCheckbox.checked ? "block" : "none";
  }

  toggleTiltField();
  gtiCheckbox.addEventListener("change", toggleTiltField);
}

function searchLocation() {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 13);

        document.getElementById("latitudeInput").value = lat.toFixed(4);
        document.getElementById("longitudeInput").value = lon.toFixed(4);
        document.getElementById("selectedCoords").textContent =
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

        if (clickedMarker) {
          map.removeLayer(clickedMarker);
        }
        clickedMarker = L.marker([lat, lon]).addTo(map);
        validateAndToggleButton();
      } else {
        alert("Location not found.");
      }
    })
    .catch((error) => {
      console.error("Error searching location:", error);
      alert(`Failed to search location: ${error.message}`);
    });
}

async function handleVisualize() {
  const visualizeBtn = document.getElementById("visualizeBtn");
  if (!validateInputs().valid) {
    alert("Please fix the errors in the form before visualizing.");
    return;
  }

  const params = getFormData();
  const dataSource = params.dataSource;
  const mode = params.mode;

  let apiUrl = "";
  switch (dataSource) {
    case "model":
      apiUrl = "/api/model";
      break;
    case "CAMS_RAD":
      apiUrl = "/api/cams";
      break;
    case "NASA":
      apiUrl = "/api/nasa";
      break;
    default:
      alert("Invalid data source selected.");
      return;
  }

  setLoadingState(visualizeBtn, true, "Processing...");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    handleError(
      new Error(
        "Request timed out. The server might be busy or the request is complex. Try a smaller date range or different parameters.",
      ),
      visualizeBtn,
      "Visualize",
    );
  }, 60000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) { /* Ignore if response is not JSON */ }
      throw new Error(errorMsg);
    }

    const result = await response.json();

    if (mode === "date") {
      // Validate basic structure of the result
      if (!result || !Array.isArray(result.data)) {
        throw new Error("Invalid data format received from the server (expected an array).");
      }

      // Validate the content of the data if array is not empty
      if (result.data.length > 0) {
        const firstPoint = result.data[0];
        if (
          !firstPoint ||
          !firstPoint.datetime || // Expecting 'datetime' key
          (firstPoint.GHI === undefined && firstPoint.DHI === undefined && firstPoint.DNI === undefined && firstPoint.irradiance === undefined) // Expecting at least one irradiance type
        ) {
          throw new Error(
            "Received data points are missing required fields (e.g., datetime, GHI/DHI/DNI, or irradiance).",
          );
        }
      }
      // Call the updated chart function
      updateChart(result.data, params.timeGranularity, dataSource);
      updateSummary(params);

    } else if (mode === "year") {
      if (!result || !Array.isArray(result.data)) {
        throw new Error("Invalid data format for year mode received from the server.");
      }
      // Assuming 'year' mode data structure is: { datetime (month name/number), mean, upper, lower }
      // This part might need adjustment if NASA/CAMS provide different structures for yearly averages.
      const stats = result.data;
      const dateLabels = stats.map(pt => pt.datetime); // Or month, year etc.
      const meanSeries = stats.map(pt => pt.mean); // Assuming 'mean' is GHI mean
      const upperSeries = stats.map(pt => pt.upper);
      const lowerSeries = stats.map(pt => pt.lower);

      avgChart(meanSeries, upperSeries, lowerSeries, dateLabels); // avgChart might also need updates for multi-component averages
    }

  } catch (error) {
    if (error.name !== "AbortError") {
      handleError(error, visualizeBtn, "Visualize");
    }
  } finally {
    if (controller.signal.aborted === false) {
      setLoadingState(
        visualizeBtn,
        false,
        '<i class="bi bi-eye me-1"></i>Visualize',
      );
    }
  }
}

/**
 * Updates the chart with new data, dynamically handling GHI, DHI, DNI.
 * Assumes dataPoints is an array of objects, where each object has a 'datetime' field (ISO string)
 * and potentially 'GHI', 'DHI', 'DNI' fields.
 * If only 'irradiance' is present (for backward compatibility with old model API), it will be used as GHI.
 * @param {Array<Object>} dataPoints - Array of data points from the API.
 * @param {string} granularity - Temporal granularity ('Hourly', 'Daily', 'Monthly').
 * @param {string} dataSource - The source of the data ('model', 'NASA', 'CAMS_RAD').
 */
function updateChart(dataPoints, granularity, dataSource) {
  if (!irradianceChart) {
    console.error("Chart is not initialized.");
    initializeChart(); // Try to re-initialize if not present
    if (!irradianceChart) return; // Still not there, bail
  }

  // Clear previous datasets and labels
  irradianceChart.data.labels = [];
  irradianceChart.data.datasets = [];
  irradianceChart.options.plugins.title.display = false; // Hide "No data" message by default

  if (!dataPoints || dataPoints.length === 0) {
    console.warn("No data points received to update the chart.");
    irradianceChart.options.plugins.title.text = "No data available for selected parameters.";
    irradianceChart.options.plugins.title.display = true;
    irradianceChart.update();
    return;
  }

  // Map granularity to Chart.js time unit
  const timeUnitMap = { Hourly: "hour", Daily: "day", Monthly: "month" };
  const timeUnit = timeUnitMap[granularity] || "day";

  // Optional: Downsample data (adjust maxPoints as needed)
  const maxPoints = { Hourly: 1000, Daily: 730, Monthly: 240 }[granularity] || 500;
  const sampledData = downsampleData(dataPoints, maxPoints);

  // Prepare labels (x-axis)
  // Assumes backend provides 'datetime' as an ISO string for all data sources.
  try {
    irradianceChart.data.labels = sampledData.map(point => new Date(point.datetime));
  } catch (e) {
    console.error("Error processing datetime for chart labels:", e);
    handleError(new Error("Could not parse datetime values for charting."));
    irradianceChart.options.plugins.title.text = "Error: Invalid date format in data.";
    irradianceChart.options.plugins.title.display = true;
    irradianceChart.update();
    return;
  }


  // Define dataset configurations (colors, labels)
  const datasetConfigs = {
    GHI: { label: 'GHI', borderColor: '#4e73df', backgroundColor: 'rgba(78, 115, 223, 0.1)', fill: true },
    DHI: { label: 'DHI', borderColor: '#1cc88a', backgroundColor: 'rgba(28, 200, 138, 0.1)', fill: true },
    DNI: { label: 'DNI', borderColor: '#f6c23e', backgroundColor: 'rgba(246, 194, 62, 0.1)', fill: true },
    // Fallback for 'model' if it only sends 'irradiance' and backend isn't updated
    irradiance: { label: 'Irradiance', borderColor: '#4e73df', backgroundColor: 'rgba(78, 115, 223, 0.1)', fill: true }
  };

  const availableDataKeys = ['GHI', 'DHI', 'DNI'];
  let dataPlotted = false;

  availableDataKeys.forEach(key => {
    // Check if the key exists and has at least one non-null value in the sampled data
    if (sampledData.some(point => point[key] !== null && point[key] !== undefined)) {
      const values = sampledData.map(point => point[key]);
      irradianceChart.data.datasets.push({
        label: datasetConfigs[key].label + ` (W/m²)`,
        data: values,
        borderColor: datasetConfigs[key].borderColor,
        backgroundColor: datasetConfigs[key].backgroundColor,
        borderWidth: 1.5,
        pointRadius: granularity === 'Hourly' ? 0 : (granularity === 'Daily' ? 1 : 2), // Smaller/no points for hourly
        tension: 0.3,
        fill: datasetConfigs[key].fill,
      });
      dataPlotted = true;
    }
  });

  // Fallback for old 'model' data if it uses 'irradiance' and GHI/DHI/DNI are not present
  if (!dataPlotted && sampledData.some(point => point.irradiance !== null && point.irradiance !== undefined)) {
    const values = sampledData.map(point => point.irradiance);
    irradianceChart.data.datasets.push({
      label: datasetConfigs.irradiance.label + ` (W/m²)`, // Use specific label
      data: values,
      borderColor: datasetConfigs.irradiance.borderColor,
      backgroundColor: datasetConfigs.irradiance.backgroundColor,
      borderWidth: 1.5,
      pointRadius: granularity === 'Hourly' ? 0 : 1,
      tension: 0.3,
      fill: datasetConfigs.irradiance.fill,
    });
    dataPlotted = true;
  }

  if (!dataPlotted) {
    console.warn("No plottable GHI, DHI, or DNI data found in the provided dataPoints.");
    irradianceChart.options.plugins.title.text = "No GHI, DHI, or DNI data to display.";
    irradianceChart.options.plugins.title.display = true;
  }

  // Update chart options
  irradianceChart.options.scales.x.time.unit = timeUnit;
  // Adjust y-axis label if only one type of data is plotted, or keep generic
  if (irradianceChart.data.datasets.length === 1) {
    // irradianceChart.options.scales.y.title.text = irradianceChart.data.datasets[0].label; // This might be too long
  } else {
    irradianceChart.options.scales.y.title.text = "Irradiance (W/m²)";
  }
  irradianceChart.options.plugins.legend.display = irradianceChart.data.datasets.length > 1;


  irradianceChart.update();
}


function downsampleData(data, maxPoints) {
  if (!data || data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function updateSummary(params) {
  const defaultText = "N/A";

  document.querySelector(".summary-card .badge-latitude").textContent = params
    ? `${params.latitude?.toFixed(4)}°`
    : defaultText;
  document.querySelector(".summary-card .badge-longitude").textContent = params
    ? `${params.longitude?.toFixed(4)}°`
    : defaultText;

  document.querySelector(".summary-card .text-granularity").textContent =
    params?.timeGranularity || defaultText;

  const displayDateFormat = { year: "numeric", month: "short", day: "numeric" };
  document.querySelector(".summary-card .text-start-date").textContent =
    params?.startDate
      ? new Date(params.startDate + "T00:00:00Z").toLocaleDateString( // Ensure UTC context for date part
        undefined,
        displayDateFormat,
      )
      : defaultText;
  document.querySelector(".summary-card .text-end-date").textContent =
    params?.endDate
      ? new Date(params.endDate + "T00:00:00Z").toLocaleDateString( // Ensure UTC context for date part
        undefined,
        displayDateFormat,
      )
      : defaultText;

  const dataSourceEl = document.querySelector(
    ".summary-card .text-data-source",
  );
  if (params?.dataSource) {
    const selectEl = document.getElementById("dataSource");
    const selectedOption = selectEl.querySelector(
      `option[value="${params.dataSource}"]`,
    );
    dataSourceEl.textContent = selectedOption
      ? selectedOption.textContent
      : params.dataSource;
  } else {
    dataSourceEl.textContent = defaultText;
  }

  document.querySelector(".summary-card .card-footer").textContent =
    `Last updated: ${new Date().toLocaleString()}`;
}

function setLoadingState(buttonElement, isLoading, loadingText = "Loading...") {
  if (isLoading) {
    buttonElement.disabled = true;
    buttonElement.dataset.originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingText}`;
  } else {
    buttonElement.disabled = false;
    buttonElement.innerHTML = buttonElement.dataset.originalText || loadingText;
  }
}

function handleError(error, buttonElement = null, buttonText = "Action") {
  console.error("Error:", error);
  const errorMessage =
    error.name === "AbortError"
      ? "Request timed out. Please try again with a smaller date range or simpler request."
      : error.message || "An unknown error occurred.";

  alert(`Error: ${errorMessage}`); // Simple alert, consider a more integrated UI element

  if (buttonElement) {
    setLoadingState(
      buttonElement,
      false,
      buttonElement.dataset.originalText || buttonText,
    );
  }
}

function resetForm() {
  document.getElementById("dataRequestForm").reset();
  document.getElementById("latitudeInput").value = "";
  document.getElementById("longitudeInput").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  flatpickr(".datepicker").clear();

  if (clickedMarker) {
    map.removeLayer(clickedMarker);
    clickedMarker = null;
  }
  map.setView([0.31166, 32.5974], 8);

  document.getElementById("selectedCoords").textContent = "None selected";
  document.getElementById("cursorCoords").textContent = "0.0000, 0.0000";

  if (irradianceChart) {
    irradianceChart.data.labels = [];
    irradianceChart.data.datasets = [];
    irradianceChart.options.plugins.title.text = ""; // Clear any "No data" message
    irradianceChart.options.plugins.title.display = false;
    irradianceChart.update();
  }

  updateSummary(null);
  validateAndToggleButton();
  setupTiltAngleToggle();
}

function validateInputs() {
  const lat = parseFloat(document.getElementById("latitudeInput").value);
  const lon = parseFloat(document.getElementById("longitudeInput").value);
  const startDateStr = document.getElementById("startDate").value;
  const endDateStr = document.getElementById("endDate").value;
  const dataSource = document.getElementById("dataSource").value;
  const mode = document.querySelector('input[name="timeRangeType"]:checked').value;


  let errors = [];

  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push("Latitude must be a number between -90 and 90.");
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    errors.push("Longitude must be a number between -180 and 180.");
  }

  if (mode === "date") {
    if (!startDateStr) errors.push("Start date is required.");
    if (!endDateStr) errors.push("End date is required.");
    if (startDateStr && endDateStr) {
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      if (startDate > endDate) {
        errors.push("Start date cannot be after end date.");
      }
    }
  } else if (mode === "year") {
    const startYear = parseInt(document.getElementById("startYear").value);
    const endYear = parseInt(document.getElementById("endYear").value);
    if (isNaN(startYear) || startYear < 1980 || startYear > 2050) errors.push("Start year is invalid.");
    if (isNaN(endYear) || endYear < 1980 || endYear > 2050) errors.push("End year is invalid.");
    if (!isNaN(startYear) && !isNaN(endYear) && startYear > endYear) errors.push("Start year cannot be after end year.");
  }


  if (!dataSource) {
    errors.push("Please select a data source.");
  }

  // GTI / Tilt Angle Validation
  const gtiChecked = document.getElementById("gti")?.checked;
  if (gtiChecked) {
    const tiltAngle = parseFloat(document.getElementById("tiltangle").value);
    if (isNaN(tiltAngle) || tiltAngle < -90 || tiltAngle > 90) {
      errors.push("Tilt angle must be a number between -90 and 90 when GTI is selected.");
    }
  }


  if (errors.length > 0) {
    return { valid: false, message: errors.join("\n") };
  }
  return { valid: true, message: "" };
}

function validateAndToggleButton() {
  const { valid, message } = validateInputs();
  const visualizeBtn = document.getElementById("visualizeBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  visualizeBtn.disabled = !valid;
  downloadBtn.disabled = !valid;

  // Optional: Display errors in a dedicated UI element instead of just disabling buttons
  const errorDisplayElement = document.getElementById("formErrorDisplay"); // Assuming you add such an element
  if (errorDisplayElement) {
    errorDisplayElement.textContent = valid ? "" : message;
    errorDisplayElement.style.display = valid ? "none" : "block";
  }
}


function getFormData() {
  return {
    latitude: parseFloat(document.getElementById("latitudeInput").value),
    longitude: parseFloat(document.getElementById("longitudeInput").value),
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    timeGranularity:
      document.querySelector(
        'input[name="Temporal Resolution"]:checked',
      )?.value || "Daily",
    dataSource: document.getElementById("dataSource").value,
    mode: document.querySelector('input[name="timeRangeType"]:checked').value,
    tiltAngle: document.getElementById("tiltangle").value, // Ensure this is collected
    gti: document.getElementById("gti")?.checked || false, // Collect GTI checkbox state
    startyear: document.getElementById("startYear").value,
    endyear: document.getElementById("endYear").value,
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const modeRadios = document.querySelectorAll('input[name="timeRangeType"]');
  const dateFields = document.getElementById("dateRangeFields");
  const yearFields = document.getElementById("yearRangeFields");
  const resolutionbuttons = document.getElementById("resolutionbtns");


  function updateSelectionMode() {
    const selectedRadio = document.querySelector(
      'input[name="timeRangeType"]:checked',
    );
    if (!selectedRadio) return;
    const selectedMode = selectedRadio.value;

    dateFields.style.display = selectedMode === "date" ? "" : "none";
    yearFields.style.display = selectedMode === "year" ? "" : "none";
    if (resolutionbuttons) { // Check if element exists
      resolutionbuttons.style.display = selectedMode === "date" ? "" : "none";
    }
    validateAndToggleButton(); // Re-validate when mode changes
  }

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", updateSelectionMode);
  });
  updateSelectionMode(); // Initial call
});

// --- avgChart function (for mode === 'year') ---
// This function might also need modification if NASA/CAMS provide
// yearly average data for DHI/DNI that you want to plot.
// For now, it's assumed to plot a single mean (likely GHI).
function avgChart(meanData, upper, lower, date_labels) {
  const ctx = document.getElementById("irradianceChart").getContext("2d");

  if (irradianceChart) {
    irradianceChart.destroy();
  }

  const data = {
    labels: date_labels,
    datasets: [
      {
        label: 'Lower Bound', // For tooltip clarity
        data: lower,
        borderColor: 'rgba(186, 185, 245, 0.5)', // Make it visible but subtle
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5], // Dashed line for bounds
      },
      {
        label: 'Upper Bound', // For tooltip clarity
        data: upper,
        borderColor: 'rgba(186, 185, 245, 0.5)', // Make it visible but subtle
        backgroundColor: "rgba(186, 185, 245, 0.2)", // Light fill for the range
        fill: "-1", // Fill to the previous dataset (lower bound)
        borderWidth: 1,
        pointRadius: 0,
        borderDash: [5, 5], // Dashed line for bounds
      },
      {
        label: "Mean GHI (W/m²)", // Assuming this is GHI mean
        data: meanData,
        borderColor: "rgba(19,18,254,1)",
        borderWidth: 2,
        pointRadius: 1,
        fill: false,
        tension: 0.2,
      },
    ],
  };

  irradianceChart = new Chart(ctx, {
    type: "line",
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "category", // Assuming date_labels are categories like 'Jan', 'Feb'
          title: { display: true, text: "Month" }, // Or "Date" if full dates
        },
        y: {
          title: { display: true, text: "GHI (W/m²)" },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { position: "top", display: true },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        title: {
          display: false // No "No data" message needed here usually
        }
      },
      interaction: { mode: "index", intersect: false },
    },
  });
}
