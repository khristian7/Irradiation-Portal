// ----------------------------------MAP section -----------------------------
let map = null;
let clickedMarker = null; 
let irradianceChart = null; // Ensure this global variable is used

document.addEventListener("DOMContentLoaded", function () {
  // --- Initialize Map ---
  initializeMap();

  // --- Initialize Chart ---
  initializeChart();

  // --- Initialize UI Elements & Event Listeners ---
  setupEventListeners();

  // --- Initialize Date Pickers ---
  flatpickr(".datepicker", {
    dateFormat: "Y-m-d", // Use ISO format (YYYY-MM-DD) for consistency
    // If you still want d/m/Y display, use altInput and altFormat:
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

    // Trigger validation check after map click
    validateAndToggleButton();
  });
}

function initializeChart() {
  const chartConfig = {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Irradiance (W/m²)", 
          data: [],
          borderColor: "#4e73df",
          backgroundColor: "rgba(78, 115, 223, 0.05)",
          borderWidth: 1,
          pointRadius: 2,
          tension: 0.4, // Smoother lines
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        // Consider adding chartjs-plugin-zoom if needed:
        // zoom: { pan: { enabled: true }, zoom: { wheel: { enabled: true }, pinch: { enabled: true } } },
        tooltip: {
          callbacks: {
            title: (context) => context[0]?.label || "", // Safer access
          },
        },
        legend: {
          position: "top", // Position legend at the top
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: "day", 
            tooltipFormat: "PPpp", 
            displayFormats: {
              hour: "HH:mm", 
              day: "MMM d",
              month: "MMM yy",
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
  // Destroy previous chart instance if it exists
  if (irradianceChart) {
    irradianceChart.destroy();
  }
  irradianceChart = new Chart(ctx, chartConfig);
}

function setupEventListeners() {
  // Map Search
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

  // Form Buttons
  document
    .getElementById("visualizeBtn")
    .addEventListener("click", handleVisualize);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", handleDownload);
  document.getElementById("cancelBtn").addEventListener("click", resetForm);
  // Input validation on change
  const formInputs = document.querySelectorAll(
    '.form-control, input[type="radio"], input[type="checkbox"], select', // Include select
  );
  formInputs.forEach((input) => {
    input.addEventListener("change", validateAndToggleButton);
  });

  // Initial validation check
  validateAndToggleButton();
}

function setupTiltAngleToggle() {
  const gtiCheckbox = document.getElementById("gti"); // Assuming 'gti' is the ID for the GTI parameter checkbox
  const tiltAngleField = document.querySelector(".tilt-angle-field");

  if (!gtiCheckbox || !tiltAngleField) return; // Exit if elements not found

  function toggleTiltField() {
    tiltAngleField.style.display = gtiCheckbox.checked ? "block" : "none";
  }

  toggleTiltField(); // Initial check
  gtiCheckbox.addEventListener("change", toggleTiltField);
}

// --- Event Handlers & Actions ---

function searchLocation() {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return; // Don't search if empty

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
        map.setView([lat, lon], 13); // Zoom in closer on search result

        // Update inputs and marker
        document.getElementById("latitudeInput").value = lat.toFixed(4);
        document.getElementById("longitudeInput").value = lon.toFixed(4);
        document.getElementById("selectedCoords").textContent =
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

        if (clickedMarker) {
          map.removeLayer(clickedMarker);
        }
        clickedMarker = L.marker([lat, lon]).addTo(map);
        validateAndToggleButton(); // Re-validate after setting coords
      } else {
        alert("Location not found.");
      }
    })
    .catch((error) => {
      console.error("Error searching location:", error);
      alert(`Failed to search location: ${error.message}`);
    });
}
//-----------Function to visualize the data-------------------
// This function handles the visualization of data based on user input
async function handleVisualize() {
  const visualizeBtn = document.getElementById("visualizeBtn");
  if (!validateInputs().valid) {
    alert("Please fix the errors in the form before visualizing.");
    return;
  }

  const params = getFormData();
  const dataSource = params.dataSource;
  const mode = params.mode;

  // Determine the correct API endpoint
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
      alert("Invalid model selected.");
      return;
  }

  // Show loading state
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
      // Try to get error message from backend response
      let errorMsg = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg; // Use backend error if available
      } catch (e) {
        // Ignore if response is not JSON
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();

    if (mode === "date"){

    // Basic validation of the received data structure
    if (!result || !Array.isArray(result.data)) {
      throw new Error("Invalid data format received from the server.");
    }

    // --- Process and update chart ---
    // Ensure data has the expected fields (datetime/irradiance or year/month/irradiance)
    const firstPoint = result.data[0];
    if (
      !firstPoint ||
      (!firstPoint.datetime && !(firstPoint.year && firstPoint.month)) ||
      firstPoint.irradiance === undefined
    ) {
      throw new Error(
        "Received data points are missing required fields (datetime/year+month or irradiance).",
      );
    }
  

    updateChart(result.data, params.timeGranularity);
    updateSummary(params);
  } 
//-----------THIS IS THE POINT I AM EDITING-------------------
  else if (mode === "year") {
    // Handle the year mode
    if (!result || !Array.isArray(result.data)) {
      throw new Error("Invalid data format received from the server.");
    }

    // `stats` is an array of { datetime, GHI, upper, lower }
    const stats = result.data;

    // pull out each series:
    const dateLabels =   stats.map(pt => pt.datetime);
    const meanSeries =   stats.map(pt => pt.mean);
    const upperSeries =  stats.map(pt => pt.upper);
    const lowerSeries =  stats.map(pt => pt.lower);

    avgChart(meanSeries, upperSeries, lowerSeries, dateLabels); // Call the corrected avgChart
 
  }
    
  }
catch (error) {
  if (error.name !== "AbortError") {
    // Don't show generic error for timeouts handled above
    handleError(error, visualizeBtn, "Visualize");
  }
    
  } finally {
    // Reset UI state (unless it was a timeout handled in setTimeout)
    if (controller.signal.aborted === false) {
      // Check if aborted by timeout
      setLoadingState(
        visualizeBtn,
        false,
        '<i class="bi bi-eye me-1"></i>Visualize',
      );
    }
  }
}

async function handleDownload() {
  const downloadBtn = document.getElementById("downloadBtn");
  if (!validateInputs().valid) {
    alert("Please fix the errors in the form before downloading.");
    return;
  }

  const params = getFormData(); // Includes dataSource now
  const format = document.querySelector(
    'input[name="outputFormat"]:checked',
  ).value;

  setLoadingState(downloadBtn, true, "Preparing...");

  try {
    const response = await fetch(`/api/export?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params), // Send all params including dataSource
    });

    if (!response.ok) {
      let errorMsg = `Download failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        /* Ignore if response not JSON */
      }
      throw new Error(errorMsg);
    }

    // Create filename with proper extension and timestamp
    const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD
    const filename = `solar_data_${params.dataSource}_${timestamp}.${format.toLowerCase()}`;

    // Handle blob download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download error:", error);
    handleError(error, downloadBtn, "Download"); // Show error to user
  } finally {
    setLoadingState(
      downloadBtn,
      false,
      '<i class="bi bi-download me-1"></i>Download',
    );
  }
}

function resetForm() {
  // Reset input fields
  document.getElementById("dataRequestForm").reset(); // Reset the form itself

  // Reset specific fields that might not be covered by form.reset()
  document.getElementById("latitudeInput").value = "";
  document.getElementById("longitudeInput").value = "";
  document.getElementById("startDate").value = ""; // Clear flatpickr inputs
  document.getElementById("endDate").value = "";
  flatpickr(".datepicker").clear(); // Clear flatpickr instances specifically

  // Reset map marker and view
  if (clickedMarker) {
    map.removeLayer(clickedMarker);
    clickedMarker = null;
  }
  map.setView([0.31166, 32.5974], 8); // Reset to default view

  // Reset coordinate displays
  document.getElementById("selectedCoords").textContent = "None selected";
  document.getElementById("cursorCoords").textContent = "0.0000, 0.0000"; // Reset cursor display

  // Clear the chart
  if (irradianceChart) {
    irradianceChart.data.labels = [];
    irradianceChart.data.datasets[0].data = [];
    irradianceChart.update();
  }

  // Reset summary card to defaults
  updateSummary(null); // Pass null to indicate reset

  // Re-validate buttons (they should become disabled)
  validateAndToggleButton();

  // Reset tilt angle field visibility
  setupTiltAngleToggle();
}


// --- Helper Functions ---

function validateInputs() {
  const lat = parseFloat(document.getElementById("latitudeInput").value);
  const lon = parseFloat(document.getElementById("longitudeInput").value);
  const startDateStr = document.getElementById("startDate").value;
  const endDateStr = document.getElementById("endDate").value;
  const dataSource = document.getElementById("dataSource").value;

  let errors = [];
/*
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push("Latitude must be a number between -90 and 90.");
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    errors.push("Longitude must be a number between -180 and 180.");
  }
  if (!startDateStr) {
    errors.push("Start date is required.");
  }
  if (!endDateStr) {
    errors.push("End date is required.");
  }
  if (startDateStr && endDateStr) {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (startDate > endDate) {
      errors.push("Start date cannot be after end date.");
    }
  }
    */
  if (!dataSource) {
    errors.push("Please select a data source.");
  }

  // Add more validation as needed (e.g., for tilt angle if GTI is checked)

  if (errors.length > 0) {
    // Optionally display errors to the user in a dedicated area
    // console.warn("Validation Errors:", errors);
    return { valid: false, message: errors.join("\n") };
  }

  return { valid: true, message: "" };
}
//#TODO: Add validation for tilt angle if GTI is selected and also valiate the avg plot
function validateAndToggleButton() {
  const { valid } = validateInputs();
  document.getElementById("visualizeBtn").disabled = !valid;
  document.getElementById("downloadBtn").disabled = !valid;
}

function getFormData() {
  // Assumes flatpickr is configured to output 'YYYY-MM-DD'
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  const params = {
    latitude: parseFloat(document.getElementById("latitudeInput").value),
    longitude: parseFloat(document.getElementById("longitudeInput").value),
    startDate: startDate,
    endDate: endDate,
    timeGranularity:
      document.querySelector(
        'input[name="Temporal Resolution"]:checked',
      )?.value || "Daily",
    dataSource: document.getElementById("dataSource").value,
    mode : document.querySelector('input[name="timeRangeType"]:checked').value,
    tiltAngle: document.getElementById("tiltangle").value,
    startyear: document.getElementById("startYear").value,
    endyear: document.getElementById("endYear").value,
  };
  return params;
}

function updateChart(dataPoints, granularity) {
  if (!irradianceChart) {
    console.error("Chart is not initialized.");
    return;
  }
  if (!dataPoints || dataPoints.length === 0) {
    console.warn("No data points received to update the chart.");
    // Optionally clear the chart or show a message
    irradianceChart.data.labels = [];
    irradianceChart.data.datasets[0].data = [];
    irradianceChart.options.plugins.title = {
      display: true,
      text: "No data available for selected parameters.",
    }; // Show message on chart
    irradianceChart.update();
    return;
  }

  // Map resolution to valid Chart.js time unit
  const timeUnitMap = {
    Hourly: "hour",
    Daily: "day",
    Monthly: "month",
  };
  const timeUnit = timeUnitMap[granularity] || "day"; 

  // Determine appropriate downsampling (optional, adjust as needed)
  const maxPoints =
    { Hourly: 1000, Daily: 730, Monthly: 120 }[granularity] || 500;
  const sampledData = downsampleData(dataPoints, maxPoints);

  let labels = [];
  let values = [];

  // Process data based on expected structure (adjust if CAMS/NASA differ)
  try {
    if (granularity === "Monthly") {
      labels = sampledData.map(
        (point) => new Date(point.year, point.month - 1, 1),
      ); // Use first day of month
      values = sampledData.map((point) => point.irradiance);
    } else {
      // Hourly or Daily
      labels = sampledData.map((point) => new Date(point.datetime)); // Assumes datetime string
      values = sampledData.map((point) => point.irradiance);
    }
  } catch (e) {
    console.error("Error processing data points for chart:", e);
    handleError(new Error("Could not process data format for charting."));
    return; // Stop update if data format is wrong
  }

  // Update chart data and options
  irradianceChart.data.labels = labels;
  irradianceChart.data.datasets[0].data = values;
  irradianceChart.options.scales.x.time.unit = timeUnit;

  // Update chart title/label based on granularity
  let chartLabel = `Irradiance (W/m²)`; // Base label
  if (granularity === "Hourly") {
    chartLabel = `Hourly Irradiance (W/m²)`;
  } else if (granularity === "Daily") {
    chartLabel = `Daily Average Irradiance (W/m²)`;
  } else if (granularity === "Monthly") {
    chartLabel = `Monthly Average Irradiance (W/m²)`;
  }
  irradianceChart.data.datasets[0].label = chartLabel;
  irradianceChart.options.plugins.title = { display: false };

  irradianceChart.update();
}

function downsampleData(data, maxPoints) {
  if (!data || data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function updateSummary(params) {
  const defaultText = "N/A"; // Text to show if params are null (on reset)

  // --- Location ---
  document.querySelector(".summary-card .badge-latitude").textContent = params
    ? `${params.latitude?.toFixed(4)}°`
    : defaultText;
  document.querySelector(".summary-card .badge-longitude").textContent = params
    ? `${params.longitude?.toFixed(4)}°`
    : defaultText;

  // --- Time Parameters ---
  document.querySelector(".summary-card .text-granularity").textContent =
    params?.timeGranularity || defaultText;
  // Format dates for display (assuming YYYY-MM-DD input)
  const displayDateFormat = { year: "numeric", month: "short", day: "numeric" };
  document.querySelector(".summary-card .text-start-date").textContent =
    params?.startDate
      ? new Date(params.startDate + "T00:00:00Z").toLocaleDateString(
          undefined,
          displayDateFormat,
        )
      : defaultText; // Add time/zone for correct parsing
  document.querySelector(".summary-card .text-end-date").textContent =
    params?.endDate
      ? new Date(params.endDate + "T00:00:00Z").toLocaleDateString(
          undefined,
          displayDateFormat,
        )
      : defaultText;

  // --- Data Source ---
  const dataSourceEl = document.querySelector(
    ".summary-card .text-data-source",
  );
  if (params?.dataSource) {
    // Get the display text from the dropdown option
    const selectEl = document.getElementById("dataSource");
    const selectedOption = selectEl.querySelector(
      `option[value="${params.dataSource}"]`,
    );
    dataSourceEl.textContent = selectedOption
      ? selectedOption.textContent
      : params.dataSource; // Fallback to value if text not found
  } else {
    dataSourceEl.textContent = defaultText;
  }

  // --- Footer ---
  document.querySelector(".summary-card .card-footer").textContent =
    `Last updated: ${new Date().toLocaleString()}`;
}

function setLoadingState(buttonElement, isLoading, loadingText = "Loading...") {
  if (isLoading) {
    buttonElement.disabled = true;
    // Store original text
    buttonElement.dataset.originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingText}`;
  } else {
    buttonElement.disabled = false;
    // Restore original text or set new text
    buttonElement.innerHTML = buttonElement.dataset.originalText || loadingText;
  }
}

function handleError(error, buttonElement = null, buttonText = "Action") {
  console.error("Error:", error);
  const errorMessage =
    error.name === "AbortError"
      ? "Request timed out. Please try again with a smaller date range or simpler request."
      : error.message || "An unknown error occurred.";

  // Display error to user (e.g., using an alert or a dedicated error message area)
  alert(`Error: ${errorMessage}`);

  // Reset button state if provided
  if (buttonElement) {
    setLoadingState(
      buttonElement,
      false,
      buttonElement.dataset.originalText || buttonText,
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const modeRadios = document.querySelectorAll('input[name="timeRangeType"]');
  const dateFields = document.getElementById("dateRangeFields");
  const yearFields = document.getElementById("yearRangeFields");

  function updateSelectionMode() {
    const selectedRadio = document.querySelector(
      'input[name="timeRangeType"]:checked',
    );

    const resolutionbuttons = document.getElementById("resolutionbtns");

    if (!selectedRadio) {
      console.error("No time range type radio button is checked!");
      return;
    }

    const selectedMode = selectedRadio.value;

    if (selectedMode === "date") {
      dateFields.style.display = "";
      yearFields.style.display = "none";
      resolutionbuttons.style.display = "";
    } else {
      dateFields.style.display = "none";
      yearFields.style.display = "";
      resolutionbuttons.style.display = "none";
    }
  }

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", updateSelectionMode);
  });
  updateSelectionMode();
});


// --- Corrected avgChart function ---
function avgChart(meanData, upper, lower, date_labels) {
  const ctx = document.getElementById("irradianceChart").getContext("2d");

  // Destroy previous chart instance if it exists
  if (irradianceChart) {
    irradianceChart.destroy();
  }

  // --- Build datasets ---
  const data = {
    labels: date_labels, 
    datasets: [
      {
        // invisible lower boundary
        data: lower,
        fill: false, 
        pointRadius: 0,
        borderWidth: 1, 
      },
      {
        // shaded area (Range)
        data: upper,
        fill: "-1", 
        backgroundColor: "rgba(186, 185, 245, 0.5)", 
        pointRadius: 0,
        borderWidth: 1,
      },
      {
        // mean line
        label: "Mean GHI",
        data: meanData,
        borderColor: "rgba(19,18,254,1)",
        borderWidth: 3, 
        pointRadius: 1,
        fill: false,
        tension: 0.2, 
        order: 2
      },
    ],
  };

  // --- 4. Config & render ---
  irradianceChart = new Chart(ctx, { 
    type: "line",
    data: data, 
    options: {
      responsive: true,
      maintainAspectRatio: false, 
      scales: {
        x: {
          type: "category", 
          title: { display: true, text: "Date" },
        },
        y: {
          title: { display: true, text: "GHI (W/m²)" },
          suggestedMin: 0,
        },
      },
      plugins: {
        legend: { position: "top" },
        tooltip: {
            mode: 'index', 
            intersect: false,
        }
      },
      interaction: { mode: "index", intersect: false },
    },
  });
}