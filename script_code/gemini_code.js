// ---------------------------------- Global Variables -----------------------------
let map = null;
let clickedMarker = null; // Keep track of the marker placed by user click
let irradianceChart = null; // Keep track of the Chart.js instance

// ---------------------------------- Initialization -----------------------------

/**
 * Main function executed when the DOM is fully loaded.
 * Initializes the map, chart, date pickers, and sets up event listeners.
 */
document.addEventListener("DOMContentLoaded", function () {
  initializeMap();
  initializeChart(); // Initialize with default options
  setupEventListeners();
  initializeDatePickers();
  setupTiltAngleToggle();
  setupTimeRangeSelection(); // Setup initial state and listeners for date/year range
});

/**
 * Initializes the Leaflet map.
 */
function initializeMap() {
  // Default view set to Kampala, Uganda
  map = L.map("map").setView([0.31166, 32.5974], 8);

  // Add OpenStreetMap tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Display cursor coordinates
  const cursorCoords = document.getElementById("cursorCoords");
  map.on("mousemove", function (e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    cursorCoords.textContent = `${lat}, ${lng}`;
  });

  // Handle map clicks to set coordinates and place marker
  map.on("click", function (e) {
    const clickedLat = e.latlng.lat.toFixed(4);
    const clickedLng = e.latlng.lng.toFixed(4);

    // Update input fields and display
    document.getElementById("latitudeInput").value = clickedLat;
    document.getElementById("longitudeInput").value = clickedLng;
    document.getElementById("selectedCoords").textContent =
      `${clickedLat}, ${clickedLng}`;

    // Remove previous marker if exists and add a new one
    if (clickedMarker) {
      map.removeLayer(clickedMarker);
    }
    clickedMarker = L.marker(e.latlng).addTo(map);

    // Validate inputs after setting coordinates via map click
    validateAndToggleButton();
  });
}

/**
 * Initializes the Chart.js instance with default configuration.
 * This chart will be updated later with actual data.
 */
function initializeChart() {
  const chartConfig = {
    type: "line", // Default type, can be changed later
    data: {
      labels: [],
      datasets: [
        // Placeholder dataset, will be replaced by actual data
        {
          label: "Irradiance (W/m²)",
          data: [],
          borderColor: "#4e73df",
          backgroundColor: "rgba(78, 115, 223, 0.05)",
          borderWidth: 1,
          pointRadius: 2,
          tension: 0.1, // Slightly less smoothing than default
          fill: false, // Default fill behavior
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index", // Tooltip shows data for all datasets at that index
        intersect: false, // Tooltip triggers even without direct hover on point
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (context) => context[0]?.label || "", // Safer access to label
          },
        },
        legend: {
          position: "top",
        },
        title: {
          // Placeholder for chart titles (e.g., error messages)
          display: false,
          text: "",
        },
      },
      scales: {
        x: {
          // Default to time scale, adjusted by plotting functions
          type: "time",
          time: {
            unit: "day", // Default unit
            tooltipFormat: "PPpp", // e.g., Aug 18, 2024, 12:00:00 PM (requires date-fns adapter)
            displayFormats: {
              // How labels are shown on the axis
              hour: "HH:mm",
              day: "MMM d",
              month: "MMM yyyy",
            },
          },
          title: { display: true, text: "Time" },
          grid: { display: false }, // Hide vertical grid lines
        },
        y: {
          title: { display: true, text: "Irradiance (W/m²)" },
          beginAtZero: true, // Ensure Y-axis starts at 0
        },
      },
    },
  };

  const ctx = document.getElementById("irradianceChart").getContext("2d");
  // Destroy previous chart instance if it exists to prevent memory leaks
  if (irradianceChart) {
    irradianceChart.destroy();
  }
  irradianceChart = new Chart(ctx, chartConfig);
}

/**
 * Initializes Flatpickr date pickers for start and end date inputs.
 */
function initializeDatePickers() {
  flatpickr(".datepicker", {
    dateFormat: "Y-m-d", // Internal format: ISO 8601 (YYYY-MM-DD) for reliability
    altInput: true, // Show a user-friendly format in the input field
    altFormat: "d/m/Y", // Display format: DD/MM/YYYY
    onChange: function (selectedDates, dateStr, instance) {
      // Trigger validation whenever a date is changed
      validateAndToggleButton();
    },
  });
}

/**
 * Sets up all necessary event listeners for UI elements.
 */
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

  // Main Action Buttons
  document
    .getElementById("visualizeBtn")
    .addEventListener("click", handleVisualize);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", handleDownload);
  document.getElementById("cancelBtn").addEventListener("click", resetForm);
  document
    .getElementById("downloadPdfBtn")
    .addEventListener("click", downloadChartAsImage); // Note: Downloads as PNG

  // Input validation listeners
  const formInputs = document.querySelectorAll(
    // Select all relevant input types and select elements
    "#dataRequestForm input, #dataRequestForm select, #dataRequestForm textarea",
    //'.form-control, input[type="radio"], input[type="checkbox"], select' // Original selector
  );
  formInputs.forEach((input) => {
    // Use 'input' for text fields for immediate feedback, 'change' for others
    const eventType =
      input.type === "text" ||
      input.type === "number" ||
      input.tagName === "TEXTAREA"
        ? "input"
        : "change";
    // Add listener to validate and toggle button states on input/change
    input.addEventListener(eventType, validateAndToggleButton);
  });

  // Specific listeners for year inputs to validate range
  document
    .getElementById("startYear")
    .addEventListener("input", validateAndToggleButton);
  document
    .getElementById("endYear")
    .addEventListener("input", validateAndToggleButton);

  // Initial validation check on page load
  validateAndToggleButton();
}

/**
 * Sets up the toggle functionality for the Tilt Angle input field based on the GTI checkbox.
 */
function setupTiltAngleToggle() {
  const gtiCheckbox = document.getElementById("gti");
  const tiltAngleField = document.querySelector(".tilt-angle-field");

  if (!gtiCheckbox || !tiltAngleField) {
    console.warn("GTI checkbox or tilt angle field not found.");
    return;
  }

  function toggleTiltField() {
    tiltAngleField.style.display = gtiCheckbox.checked ? "block" : "none";
    // Re-validate when toggling, as tilt angle might become required/unrequired
    validateAndToggleButton();
  }

  toggleTiltField(); // Initial check on page load
  gtiCheckbox.addEventListener("change", toggleTiltField); // Listen for changes
}

/**
 * Sets up the logic to show/hide Date Range or Year Range input fields
 * based on the selected radio button ('timeRangeType').
 */
function setupTimeRangeSelection() {
  const modeRadios = document.querySelectorAll('input[name="timeRangeType"]');
  const dateFields = document.getElementById("dateRangeFields");
  const yearFields = document.getElementById("yearRangeFields");

  function updateSelectionMode() {
    const selectedRadio = document.querySelector(
      'input[name="timeRangeType"]:checked',
    );

    // Default to 'date' mode if nothing is selected (shouldn't happen with 'checked' in HTML)
    const selectedMode = selectedRadio ? selectedRadio.value : "date";

    if (selectedMode === "date") {
      dateFields.style.display = ""; // Show date fields
      yearFields.style.display = "none"; // Hide year fields
    } else {
      // 'year' mode
      dateFields.style.display = "none"; // Hide date fields
      yearFields.style.display = ""; // Show year fields
    }
    // Re-validate as input requirements (dates vs years) change
    validateAndToggleButton();
  }

  // Add change listeners to radio buttons
  modeRadios.forEach((radio) => {
    radio.addEventListener("change", updateSelectionMode);
  });

  // Initial setup based on the default checked radio button on page load
  updateSelectionMode();
}

// ---------------------------------- Event Handlers & Actions -----------------------------

/**
 * Searches for a location using the Nominatim API based on user input.
 * Updates the map view and coordinate input fields.
 */
function searchLocation() {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return; // Do nothing if search query is empty

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

  // Indicate loading state (optional)
  // setLoadingState(document.getElementById("searchBtn"), true, "Searching...");

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Nominatim API error: ${response.status} ${response.statusText}`,
        );
      }
      return response.json();
    })
    .then((data) => {
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 13); // Zoom in closer on the search result

        // Update input fields and marker
        document.getElementById("latitudeInput").value = lat.toFixed(4);
        document.getElementById("longitudeInput").value = lon.toFixed(4);
        document.getElementById("selectedCoords").textContent =
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

        if (clickedMarker) {
          map.removeLayer(clickedMarker);
        }
        clickedMarker = L.marker([lat, lon]).addTo(map);
        validateAndToggleButton(); // Re-validate after setting coordinates
      } else {
        handleError(
          "Location not found.",
          document.getElementById("searchBtn"),
          "Search",
        );
      }
    })
    .catch((error) => {
      console.error("Error searching location:", error);
      handleError(
        `Failed to search location: ${error.message}`,
        document.getElementById("searchBtn"),
        "Search",
      );
    });
  // .finally(() => {
  //   setLoadingState(document.getElementById("searchBtn"), false, "Search");
  // });
}

/**
 * Handles the "Visualize" button click.
 * Validates inputs, fetches data from the backend based on selections,
 * and calls the appropriate function to update/draw the chart.
 */
async function handleVisualize() {
  const visualizeBtn = document.getElementById("visualizeBtn");
  const validationResult = validateInputs();
  if (!validationResult.valid) {
    // Display validation errors clearly
    alert(
      `Please fix the errors in the form before visualizing:\n\n${validationResult.message}`,
    );
    return;
  }

  const params = getFormData(); // Get all form parameters including plot_mode
  const dataSource = params.dataSource;

  // --- Determine API endpoint based on data source ---
  // !!! REPLACE WITH YOUR ACTUAL BACKEND API ENDPOINTS !!!
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
      handleError("Invalid data source selected.");
      return;
  }

  // --- UI Updates: Show Loading State ---
  setLoadingState(visualizeBtn, true, "Processing...");
  // Clear previous chart title/message immediately
  if (irradianceChart) {
    irradianceChart.options.plugins.title.display = false;
    irradianceChart.update("none"); // Update without animation
  }

  // --- Fetch Data with Timeout ---
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    // Custom timeout error handling
    handleError(
      new Error("Request timed out."), // Use a specific error message
      visualizeBtn,
      '<i class="bi bi-eye me-1"></i>Visualize', // Original button text
    );
  }, 60000); // 60 seconds timeout

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params), // Send all parameters
      signal: controller.signal, // Link fetch to abort controller
    });

    clearTimeout(timeoutId); // Clear the timeout if fetch completes successfully

    // --- Handle HTTP Errors ---
    if (!response.ok) {
      let errorMsg = `Data request failed: ${response.status} ${response.statusText}`;
      try {
        // Try to parse more specific error from backend response body
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        /* Ignore if response body is not JSON */
      }
      throw new Error(errorMsg);
    }

    // --- Process Successful Response ---
    const result = await response.json();

    // Validate the basic structure of the response
    if (!result || !Array.isArray(result.data)) {
      throw new Error(
        "Invalid data format received from server (expected {data: [...]} ).",
      );
    }

    // Handle empty data array
    if (result.data.length === 0) {
      console.warn("No data points received for the selected parameters.");
      if (irradianceChart) {
        // Clear chart and show "No data" message
        irradianceChart.data.labels = [];
        irradianceChart.data.datasets = []; // Clear datasets completely
        irradianceChart.options.plugins.title = {
          display: true,
          text: "No data available for the selected parameters.",
        };
        irradianceChart.update();
      }
      updateSummary(params); // Update summary card even if no data
      return; // Stop processing
    }

    // --- Call Appropriate Charting Function Based on Plot Mode ---
    if (params.plot_mode === "date") {
      // Validate data structure for time-series plot
      const firstPoint = result.data[0];
      if (
        !firstPoint ||
        firstPoint.irradiance === undefined ||
        (!firstPoint.datetime && !(firstPoint.year && firstPoint.month))
      ) {
        throw new Error(
          "Received data points for 'Date Range' mode are missing required fields (datetime/year+month or irradiance).",
        );
      }
      updateTimeSeriesChart(result.data, params.timeGranularity);
    } else {
      // plot_mode === "year"
      // Validate data structure for average plot
      const firstPoint = result.data[0];
      if (
        !firstPoint ||
        !firstPoint.datetime ||
        firstPoint.irradiance === undefined
      ) {
        throw new Error(
          "Received data points for 'Year Range' mode are missing required fields (datetime and irradiance).",
        );
      }
      drawAvgChart(result.data); // Draw the average + std dev chart
    }

    // Update the summary card with the request parameters
    updateSummary(params);
  } catch (error) {
    // Handle fetch errors, parsing errors, or validation errors
    if (error.name !== "AbortError") {
      // AbortError is handled by the timeout logic
      handleError(
        error,
        visualizeBtn,
        '<i class="bi bi-eye me-1"></i>Visualize',
      );
    }
  } finally {
    // Reset loading state ONLY if the request wasn't aborted by the timeout
    if (!controller.signal.aborted) {
      setLoadingState(
        visualizeBtn,
        false,
        '<i class="bi bi-eye me-1"></i>Visualize',
      );
    }
  }
}

/**
 * Handles the "Download" button click for downloading data (CSV/JSON).
 * Validates inputs, sends parameters to the backend export endpoint,
 * and triggers a file download.
 */
async function handleDownload() {
  const downloadBtn = document.getElementById("downloadBtn");
  const validationResult = validateInputs();
  if (!validationResult.valid) {
    alert(
      `Please fix the errors in the form before downloading:\n\n${validationResult.message}`,
    );
    return;
  }

  const params = getFormData(); // Get all form data
  const format =
    document.querySelector('input[name="outputFormat"]:checked')?.value ||
    "CSV"; // Default to CSV

  setLoadingState(downloadBtn, true, "Preparing...");

  // !!! REPLACE WITH YOUR ACTUAL BACKEND EXPORT ENDPOINT !!!
  const exportApiUrl = `/api/export?format=${format.toLowerCase()}`;

  try {
    const response = await fetch(exportApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params), // Send all parameters
    });

    // Handle HTTP errors during download request
    if (!response.ok) {
      let errorMsg = `Download request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        /* Ignore if response not JSON */
      }
      throw new Error(errorMsg);
    }

    // --- Process Successful Download Response ---
    const blob = await response.blob(); // Get the file data as a Blob

    // Create filename with timestamp and format
    const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD
    const filename = `solar_data_${params.dataSource}_${timestamp}.${format.toLowerCase()}`;

    // Create a temporary link to trigger the download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link); // Append link to body
    link.click(); // Simulate click to trigger download

    // Clean up the temporary link and object URL
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download error:", error);
    handleError(
      error,
      downloadBtn,
      '<i class="bi bi-download me-1"></i>Download',
    );
  } finally {
    // Ensure button state is always reset
    setLoadingState(
      downloadBtn,
      false,
      '<i class="bi bi-download me-1"></i>Download',
    );
  }
}

/**
 * Resets the entire form, map, chart, and summary to their initial states.
 */
function resetForm() {
  // Reset the form element itself
  const form = document.getElementById("dataRequestForm"); // Assuming your form has this ID
  if (form) {
    form.reset();
  } else {
    console.warn("Form element #dataRequestForm not found for reset.");
    // Manual reset as fallback (less reliable for radios/checkboxes)
    document
      .querySelectorAll(
        '#sidebar input[type="text"], #sidebar input[type="number"], #sidebar select',
      )
      .forEach((input) => (input.value = ""));
    document
      .querySelectorAll(
        '#sidebar input[type="radio"], #sidebar input[type="checkbox"]',
      )
      .forEach((input) => (input.checked = false));
    // Manually set default checked radios/checkboxes if needed
    document.getElementById("Hourly").checked = true; // Example default
    document.getElementById("csv").checked = true; // Example default
    document.getElementById("ghi").checked = true; // Example default
    document.getElementById("date").checked = true; // Example default
  }

  // Explicitly clear fields managed by libraries or needing specific reset
  document.getElementById("latitudeInput").value = "";
  document.getElementById("longitudeInput").value = "";
  // Clear Flatpickr instances
  document.querySelectorAll(".datepicker").forEach((picker) => {
    if (picker._flatpickr) {
      picker._flatpickr.clear();
    }
  });
  document.getElementById("startYear").value = ""; // Clear year inputs
  document.getElementById("endYear").value = "";

  // Reset map marker and view
  if (clickedMarker) {
    map.removeLayer(clickedMarker);
    clickedMarker = null;
  }
  map.setView([0.31166, 32.5974], 8); // Reset to default view

  // Reset coordinate displays
  document.getElementById("selectedCoords").textContent = "None selected";
  document.getElementById("cursorCoords").textContent = "0.0000, 0.0000";

  // Re-initialize the chart completely to clear data and reset options
  initializeChart();

  // Reset summary card to default text
  updateSummary(null); // Pass null to indicate reset

  // Reset time range selection UI to default ('date' mode)
  setupTimeRangeSelection(); // This shows/hides fields correctly

  // Reset tilt angle field visibility based on default GTI state (likely unchecked)
  setupTiltAngleToggle(); // This also triggers validation

  // Re-validate buttons (they should become disabled after reset)
  validateAndToggleButton();
}

/**
 * Downloads the current chart displayed on the canvas as a PNG image.
 */
function downloadChartAsImage() {
  if (
    !irradianceChart ||
    !irradianceChart.data ||
    irradianceChart.data.labels.length === 0
  ) {
    alert("Please generate a chart first before downloading.");
    return;
  }

  const canvas = document.getElementById("irradianceChart");
  try {
    const imageData = canvas.toDataURL("image/png"); // Get image data as PNG

    // Create a temporary link element to trigger download
    const link = document.createElement("a");
    link.href = imageData;

    // Suggest a filename
    const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
    link.download = `solar_irradiance_chart_${timestamp}.png`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("Error generating chart image:", e);
    alert(
      "Could not generate chart image. The chart might be empty or contain unsupported elements.",
    );
  }
}

// ---------------------------------- Helper Functions -----------------------------

/**
 * Validates all relevant user inputs based on the current selections.
 * @returns {{valid: boolean, message: string}} An object indicating if inputs are valid and an error message string.
 */
function validateInputs() {
  const lat = parseFloat(document.getElementById("latitudeInput").value);
  const lon = parseFloat(document.getElementById("longitudeInput").value);
  // Get the value of the currently selected plot mode radio button ('date' or 'year')
  const plotMode = document.querySelector(
    'input[name="timeRangeType"]:checked',
  )?.value;
  const dataSource = document.getElementById("dataSource").value;
  const gtiChecked = document.getElementById("gti")?.checked;
  const tiltAngle = parseFloat(document.getElementById("tiltangle")?.value);

  let errors = []; // Array to hold validation error messages

  // --- Location Validation ---
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push("• Latitude must be a number between -90 and 90.");
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    errors.push("• Longitude must be a number between -180 and 180.");
  }

  // --- Data Source Validation ---
  if (!dataSource) {
    errors.push("• Please select a data source.");
  }

  // --- Time Range Validation (Conditional) ---
  if (plotMode === "date") {
    const startDateStr = document.getElementById("startDate").value; // Format: YYYY-MM-DD
    const endDateStr = document.getElementById("endDate").value; // Format: YYYY-MM-DD

    if (!startDateStr) {
      errors.push("• Start date is required for 'Date Range' mode.");
    }
    if (!endDateStr) {
      errors.push("• End date is required for 'Date Range' mode.");
    }
    // Check date order only if both dates are present
    if (startDateStr && endDateStr && startDateStr > endDateStr) {
      errors.push("• Start date cannot be after end date.");
    }
    // Optional: Add specific date range limits based on data source
    // e.g., if (dataSource === 'CAMS_RAD' && ...) errors.push("CAMS data range is...");
  } else if (plotMode === "year") {
    const startYearStr = document.getElementById("startYear").value;
    const endYearStr = document.getElementById("endYear").value;
    const startYear = parseInt(startYearStr, 10);
    const endYear = parseInt(endYearStr, 10);

    // Check if years are entered and are valid numbers
    if (!startYearStr || isNaN(startYear)) {
      errors.push(
        "• Start year is required and must be a number for 'Year Range' mode.",
      );
    }
    if (!endYearStr || isNaN(endYear)) {
      errors.push(
        "• End year is required and must be a number for 'Year Range' mode.",
      );
    }
    // Check year order only if both are valid numbers
    if (!isNaN(startYear) && !isNaN(endYear)) {
      if (startYear > endYear) {
        errors.push("• Start year cannot be after end year."); // Specific validation added
      }
      // Optional: Add specific year range limits
      const currentYear = new Date().getFullYear();
      if (startYear < 1980 || endYear > currentYear) {
        errors.push(
          `• Years must typically be between 1980 and ${currentYear}.`,
        );
      }
    }
  } else {
    // This case should ideally not happen if a default radio is checked
    errors.push(
      "• Please select a time range mode ('Date Range' or 'Year Range').",
    );
  }

  // --- Tilt Angle Validation (Conditional) ---
  if (gtiChecked && (isNaN(tiltAngle) || tiltAngle < -90 || tiltAngle > 90)) {
    errors.push(
      "• Tilt angle must be a number between -90 and 90 when GTI is selected.",
    );
  }

  // --- Return validation result ---
  const isValid = errors.length === 0;
  return {
    valid: isValid,
    message: isValid ? "Inputs are valid." : errors.join("\n"), // Join errors with newlines
  };
}

/**
 * Enables or disables the Visualize and Download buttons based on input validity.
 */
function validateAndToggleButton() {
  const { valid } = validateInputs(); // Check if all inputs are currently valid
  document.getElementById("visualizeBtn").disabled = !valid;
  document.getElementById("downloadBtn").disabled = !valid;
  // Note: Download Chart button state depends on chart data, not form validity.
}

/**
 * Gathers all form data into a structured JavaScript object.
 * @returns {object} An object containing all relevant parameters for API requests.
 */
function getFormData() {
  const plotMode =
    document.querySelector('input[name="timeRangeType"]:checked')?.value ||
    "date"; // Default to 'date'

  // Basic parameters
  const params = {
    latitude: parseFloat(document.getElementById("latitudeInput").value) || 0,
    longitude: parseFloat(document.getElementById("longitudeInput").value) || 0,
    dataSource: document.getElementById("dataSource").value,
    timeGranularity:
      document.querySelector('input[name="Temporal Resolution"]:checked')
        ?.value || "Daily",
    plot_mode: plotMode, // Include the selected plot mode ('date' or 'year')
    // Add selected irradiance parameters (GHI, BHI, etc.) if needed by backend
    // parameters: Array.from(document.querySelectorAll('input[name="irradianceParam"]:checked')).map(el => el.value)
  };

  // Add date or year range based on the selected plot mode
  if (plotMode === "date") {
    params.startDate = document.getElementById("startDate").value; // Format: YYYY-MM-DD
    params.endDate = document.getElementById("endDate").value; // Format: YYYY-MM-DD
  } else {
    // plot_mode === 'year'
    params.startYear = parseInt(document.getElementById("startYear").value, 10);
    params.endYear = parseInt(document.getElementById("endYear").value, 10);
    // Decide if backend needs full date range for 'year' mode or just years.
    // If dates needed:
    // params.startDate = `${params.startYear}-01-01`;
    // params.endDate = `${params.endYear}-12-31`;
  }

  // Add GTI parameters if checked
  const gtiChecked = document.getElementById("gti")?.checked;
  if (gtiChecked) {
    params.gti = true; // Indicate GTI calculation is requested
    params.tiltAngle = parseFloat(document.getElementById("tiltangle")?.value);
    // Validation ensures tiltAngle is valid if gtiChecked is true
  } else {
    params.gti = false;
  }

  return params;
}

/**
 * Updates the chart for a standard time-series plot (Date Range mode).
 * @param {Array} dataPoints - Array of data objects from the API (e.g., {datetime: '...', irradiance: ...}).
 * @param {string} granularity - The time granularity ('Hourly', 'Daily', 'Monthly').
 */
function updateTimeSeriesChart(dataPoints, granularity) {
  if (!irradianceChart) {
    console.error("Chart is not initialized.");
    return;
  }
  // Empty data check is handled in handleVisualize

  // Map granularity to Chart.js time unit
  const timeUnitMap = { Hourly: "hour", Daily: "day", Monthly: "month" };
  const timeUnit = timeUnitMap[granularity] || "day";

  // Optional: Downsample data if performance is an issue
  // const maxPoints = { Hourly: 1000, Daily: 730, Monthly: 120 }[granularity] || 500;
  // const sampledData = downsampleData(dataPoints, maxPoints);
  const sampledData = dataPoints; // Use raw data for now

  let labels = [];
  let values = [];

  // Process data points into labels (dates) and values (irradiance)
  try {
    if (granularity === "Monthly") {
      // Handle potential year/month format OR datetime format for monthly data
      if (sampledData[0].year && sampledData[0].month) {
        labels = sampledData.map(
          (point) => new Date(Date.UTC(point.year, point.month - 1, 1)),
        ); // Use UTC for consistency
      } else {
        // Assume datetime is provided, extract year/month
        labels = sampledData.map((point) => {
          const dt = new Date(point.datetime); // Assumes datetime is UTC or parsable
          return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
        });
      }
      values = sampledData.map((point) => point.irradiance);
    } else {
      // Hourly or Daily - expect datetime
      labels = sampledData.map((point) => new Date(point.datetime)); // Parse datetime strings
      values = sampledData.map((point) => point.irradiance);
    }

    // Ensure data is sorted chronologically (important for line charts)
    const sortedPairs = labels
      .map((label, index) => ({ label, value: values[index] }))
      .sort((a, b) => a.label - b.label);
    labels = sortedPairs.map((pair) => pair.label);
    values = sortedPairs.map((pair) => pair.value);
  } catch (e) {
    console.error("Error processing data points for time series chart:", e);
    handleError(
      new Error("Could not process data format for charting. Check console."),
    );
    return;
  }

  // --- Update Chart Configuration for Time Series ---
  irradianceChart.options.scales.x.type = "time"; // Ensure X-axis is time scale
  irradianceChart.options.scales.x.time.unit = timeUnit;
  irradianceChart.options.scales.x.title.text = "Time"; // Standard time axis label

  // Update Y-axis title based on granularity
  let yAxisLabel = `Irradiance (W/m²)`; // Base label
  if (granularity === "Hourly") yAxisLabel = `Hourly Irradiance (W/m²)`;
  else if (granularity === "Daily")
    yAxisLabel = `Daily Avg Irradiance (W/m²)`; // Adjust if it's total
  else if (granularity === "Monthly")
    yAxisLabel = `Monthly Avg Irradiance (W/m²)`; // Adjust if it's total
  irradianceChart.options.scales.y.title.text = yAxisLabel;

  // Reset Y-axis suggested min/max and ensure it starts at zero
  irradianceChart.options.scales.y.suggestedMin = undefined;
  irradianceChart.options.scales.y.suggestedMax = undefined;
  irradianceChart.options.scales.y.beginAtZero = true;

  // Update chart data with a single dataset for the time series
  irradianceChart.data.labels = labels;
  irradianceChart.data.datasets = [
    {
      // Replace existing datasets
      label: yAxisLabel, // Match dataset label to Y-axis title
      data: values,
      borderColor: "#4e73df",
      backgroundColor: "rgba(78, 115, 223, 0.05)",
      borderWidth: 1,
      pointRadius: labels.length > 200 ? 0 : 2, // Hide points if dataset is large
      tension: 0.1,
      fill: false, // Typically don't fill single time series line
    },
  ];

  irradianceChart.options.plugins.title.display = false; // Hide any previous message title
  irradianceChart.update(); // Update the chart to show new data and config
}

/**
 * (Optional) Downsampling function for large datasets.
 * Selects points at regular intervals, ensuring first and last points are included.
 * @param {Array} data - The original array of data points.
 * @param {number} maxPoints - The maximum number of points desired.
 * @returns {Array} The downsampled array.
 */
function downsampleData(data, maxPoints) {
  if (!data || data.length <= maxPoints) return data; // Return original if small enough

  const step = Math.ceil(data.length / maxPoints);
  const sampled = data.filter((_, index) => index % step === 0);

  // Ensure first and last points are always included
  if (data.length > 0 && sampled[0] !== data[0] && step > 1) {
    sampled.unshift(data[0]);
  }
  if (
    data.length > 0 &&
    sampled[sampled.length - 1] !== data[data.length - 1]
  ) {
    sampled.push(data[data.length - 1]);
  }
  return sampled;
}

/**
 * Updates the summary card display with the current request parameters.
 * @param {object | null} params - The parameters object from getFormData, or null to reset.
 */
function updateSummary(params) {
  const defaultText = "N/A"; // Placeholder for empty fields

  // --- Location ---
  document.querySelector(".summary-card .badge-latitude").textContent =
    params?.latitude !== undefined
      ? `${params.latitude.toFixed(4)}°`
      : defaultText;
  document.querySelector(".summary-card .badge-longitude").textContent =
    params?.longitude !== undefined
      ? `${params.longitude.toFixed(4)}°`
      : defaultText;

  // --- Time Parameters ---
  let granularityText = defaultText;
  let startDateText = defaultText;
  let endDateText = defaultText;

  if (params) {
    granularityText = params.timeGranularity || defaultText;
    // Date display format, use UTC to avoid timezone shifts in display
    const displayDateFormat = {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    };

    if (params.plot_mode === "date") {
      // Format dates if they exist
      startDateText = params.startDate
        ? new Date(params.startDate + "T00:00:00Z").toLocaleDateString(
            undefined,
            displayDateFormat,
          )
        : defaultText;
      endDateText = params.endDate
        ? new Date(params.endDate + "T00:00:00Z").toLocaleDateString(
            undefined,
            displayDateFormat,
          )
        : defaultText;
    } else {
      // 'year' mode
      // Display year range
      startDateText =
        params.startYear !== undefined
          ? `Avg: ${params.startYear}`
          : defaultText;
      endDateText = params.endYear !== undefined ? `- ${params.endYear}` : ""; // Show end year next to start year
    }
  }

  document.querySelector(".summary-card .text-granularity").textContent =
    granularityText;
  document.querySelector(".summary-card .text-start-date").textContent =
    startDateText;
  document.querySelector(".summary-card .text-end-date").textContent =
    endDateText; // Display end date/year

  // --- Data Source ---
  const dataSourceEl = document.querySelector(
    ".summary-card .text-data-source",
  );
  if (params?.dataSource) {
    // Get the user-friendly text from the <select> dropdown option
    const selectEl = document.getElementById("dataSource");
    const selectedOption = selectEl.querySelector(
      `option[value="${params.dataSource}"]`,
    );
    dataSourceEl.textContent = selectedOption
      ? selectedOption.textContent
      : params.dataSource; // Fallback to value
  } else {
    dataSourceEl.textContent = defaultText;
  }

  // --- Footer Update Time ---
  const footerTimeEl = document.querySelector(
    ".summary-card .summary-update-time",
  );
  if (params) {
    const updateTime = new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    footerTimeEl.textContent = `Summary generated: ${updateTime}`;
  } else {
    footerTimeEl.textContent = `Summary cleared`;
  }
}

/**
 * Sets the loading state for a button element.
 * @param {HTMLElement} buttonElement - The button to update.
 * @param {boolean} isLoading - True to show loading state, false to restore normal state.
 * @param {string} [loadingText="Loading..."] - Text to display while loading.
 */
function setLoadingState(buttonElement, isLoading, loadingText = "Loading...") {
  if (!buttonElement) return; // Safety check

  if (isLoading) {
    buttonElement.disabled = true;
    // Store original HTML only if not already stored
    if (!buttonElement.dataset.originalHtml) {
      buttonElement.dataset.originalHtml = buttonElement.innerHTML;
    }
    // Set loading indicator
    buttonElement.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingText}`;
  } else {
    buttonElement.disabled = false;
    // Restore original HTML or set default text
    buttonElement.innerHTML = buttonElement.dataset.originalHtml || loadingText;
    // Clear stored HTML
    delete buttonElement.dataset.originalHtml;
  }
}

/**
 * Handles errors gracefully by logging them and showing an alert to the user.
 * Optionally resets the state of an associated button.
 * @param {Error|string} error - The error object or error message string.
 * @param {HTMLElement|null} [buttonElement=null] - The button associated with the action that failed.
 * @param {string} [buttonText="Action"] - The default text to restore on the button.
 */
function handleError(error, buttonElement = null, buttonText = "Action") {
  console.error("Error:", error); // Log the full error details to the console

  // Determine the user-friendly error message
  let errorMessage =
    "An unexpected error occurred. Please check the console for details.";
  if (error instanceof Error) {
    // Specific message for timeouts
    if (error.message === "Request timed out.") {
      errorMessage =
        "Request timed out. The server might be busy or the request is complex. Try a smaller date/year range or different parameters.";
    } else {
      errorMessage = error.message; // Use the message from the Error object
    }
  } else if (typeof error === "string") {
    errorMessage = error; // Use the string directly if it's not an Error object
  }

  // Display the error message to the user
  alert(`Error: ${errorMessage}`);

  // Reset button state if provided
  if (buttonElement) {
    const originalContent = buttonElement.dataset.originalHtml || buttonText;
    setLoadingState(buttonElement, false, originalContent);
  }

  // Optionally display an error message on the chart itself
  if (irradianceChart) {
    irradianceChart.options.plugins.title = {
      display: true,
      text: "Error loading or processing data.",
      color: "red", // Make error title stand out
    };
    // Optionally clear existing data to avoid confusion
    // irradianceChart.data.labels = [];
    // irradianceChart.data.datasets = [];
    irradianceChart.update();
  }
}

// ---------------------------------- Calculation Helpers -----------------------------

/**
 * Calculates the mean (average) of an array of numbers.
 * @param {number[]} arr - Array of numbers.
 * @returns {number} The mean, or 0 if the array is empty.
 */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

/**
 * Calculates the population standard deviation of an array of numbers.
 * @param {number[]} arr - Array of numbers.
 * @param {number} meanVal - The pre-calculated mean of the array.
 * @returns {number} The standard deviation, or 0 if array has fewer than 2 elements.
 */
function std(arr, meanVal) {
  if (!arr || arr.length < 2) return 0; // Std dev requires at least 2 points
  // Population variance (divide by N)
  const variance =
    arr.reduce((sum, v) => sum + Math.pow(v - meanVal, 2), 0) / arr.length;
  // Use sample variance (divide by N-1) if needed: / (arr.length - 1)
  return Math.sqrt(variance);
}

// ---------------------------------- Average Chart Specific Functions -----------------------------

/**
 * Aggregates data points by month and day across multiple years.
 * Calculates the average and standard deviation of irradiance for each day of the year.
 * @param {Array} data - Array of data objects (must contain 'datetime' and 'irradiance').
 * @param {number} startYear - The starting year for aggregation.
 * @param {number} endYear - The ending year for aggregation.
 * @returns {{labels: string[], avgs: number[], stds: number[]}} Object containing labels (MM-DD), averages, and standard deviations.
 */
function aggregateByDay(data, startYear, endYear) {
  const groups = {}; // Key: "MM-DD", Value: [irradiance1, irradiance2, ...]

  data.forEach((d) => {
    // Validate required fields for aggregation
    if (!d || d.irradiance === undefined || !d.datetime) {
      console.warn("Skipping invalid data point during aggregation:", d);
      return;
    }

    let dt;
    try {
      dt = new Date(d.datetime); // Parse datetime string
      if (isNaN(dt.getTime())) {
        // Check if date is valid
        console.warn(
          "Skipping data point with invalid date format:",
          d.datetime,
        );
        return;
      }
    } catch (e) {
      console.error("Error parsing date during aggregation:", d.datetime, e);
      return;
    }

    const y = dt.getFullYear(); // Get the year

    // Filter data points outside the selected year range
    if (y < startYear || y > endYear) return;

    // Create a "MM-DD" key (e.g., "03-14") for grouping
    const monthStr = String(dt.getMonth() + 1).padStart(2, "0"); // Month (1-12), padded
    const dayStr = String(dt.getDate()).padStart(2, "0"); // Day (1-31), padded
    const key = `${monthStr}-${dayStr}`;

    // Add irradiance value to the corresponding group
    groups[key] = groups[key] || [];
    groups[key].push(d.irradiance);
  });

  // Sort the MM-DD keys chronologically
  const keys = Object.keys(groups).sort();

  // Calculate average and standard deviation for each day's group
  const labels = keys; // Labels are the sorted "MM-DD" keys
  const avgs = keys.map((k) => mean(groups[k])); // Calculate mean for each day
  const stds = keys.map((k, i) => std(groups[k], avgs[i])); // Calculate std dev using the mean

  return { labels, avgs, stds };
}

/**
 * Draws the average + standard deviation chart (Year Range mode).
 * @param {Array} rawData - The raw data array from the API (must contain 'datetime' and 'irradiance').
 */
function drawAvgChart(rawData) {
  if (!irradianceChart) {
    console.error("Chart is not initialized.");
    return;
  }

  // Get selected start and end years from input fields
  const startY = parseInt(document.getElementById("startYear").value, 10);
  const endY = parseInt(document.getElementById("endYear").value, 10);

  // Basic validation for years (already done in validateInputs, but good safety check)
  if (isNaN(startY) || isNaN(endY) || startY > endY) {
    handleError("Invalid start or end year selected for averaging.");
    return;
  }

  // Aggregate data by day across the selected years
  const { labels, avgs, stds } = aggregateByDay(rawData, startY, endY);

  // Handle case where no data falls within the year range
  if (labels.length === 0) {
    console.warn(
      `No data points found between ${startY} and ${endY} for averaging.`,
    );
    // Show message on chart
    irradianceChart.options.plugins.title = {
      display: true,
      text: `No data available for average between ${startY} and ${endY}.`,
    };
    irradianceChart.data.labels = [];
    irradianceChart.data.datasets = []; // Clear datasets
    irradianceChart.update();
    return;
  }

  // Calculate upper (+1 STD) and lower (-1 STD) bounds for the fill band
  const upper = avgs.map((v, i) => v + stds[i]);
  // Ensure lower bound doesn't go below zero for irradiance
  const lower = avgs.map((v, i) => Math.max(0, v - stds[i]));

  // --- Update Chart Configuration for Average Chart ---
  irradianceChart.options.scales.x.type = "category"; // Use category axis for "MM-DD" labels
  irradianceChart.options.scales.x.title.text = "Day of Year (Month-Day)";
  irradianceChart.options.scales.y.title.text = `Avg Daily Irradiance (${startY}-${endY}) (W/m²)`;
  irradianceChart.options.scales.y.beginAtZero = true; // Keep Y-axis starting at 0

  // Adjust Y-axis range to nicely fit the average +/- standard deviation
  const overallMin = Math.min(...lower);
  const overallMax = Math.max(...upper);
  const padding = (overallMax - overallMin) * 0.1; // Add 10% padding top and bottom
  irradianceChart.options.scales.y.suggestedMin = Math.max(
    0,
    overallMin - padding,
  );
  irradianceChart.options.scales.y.suggestedMax = overallMax + padding;

  // Define datasets for Average line and +/- 1 STD bands
  irradianceChart.data.labels = labels; // "MM-DD" labels
  irradianceChart.data.datasets = [
    {
      label: `Average (${startY}-${endY})`,
      data: avgs,
      borderColor: "#4e73df", // Blue for average line
      borderWidth: 2,
      pointRadius: 0, // Hide points on the average line
      tension: 0.1,
      fill: false, // Do not fill the average line itself
      order: 1, // Draw average line on top of bands
    },
    {
      label: "±1 Standard Deviation", // Single label for the band in legend
      data: upper, // Upper bound data
      borderColor: "transparent", // Hide the line for the upper bound
      backgroundColor: "rgba(78, 115, 223, 0.15)", // Light blue fill for the band
      borderWidth: 0, // No border for the band lines
      pointRadius: 0,
      fill: "+1", // Fill down to the next dataset (the lower bound)
      order: 2, // Draw bands behind the average line
    },
    {
      label: "-1 STD (hidden)", // Label for lower bound (hidden from legend)
      data: lower, // Lower bound data
      borderColor: "transparent", // Hide the line
      backgroundColor: "rgba(78, 115, 223, 0.15)", // Same fill as upper for consistency
      borderWidth: 0,
      pointRadius: 0,
      fill: false, // Lower bound doesn't need fill itself
      order: 3,
      legend: {
        // Attempt to hide this dataset from the legend (may need Chart.js plugin or filter)
        display: false,
      },
    },
  ];

  // Filter legend items to hide the "-1 STD" entry
  irradianceChart.options.plugins.legend.labels = {
    filter: function (legendItem, chartData) {
      // Hide the legend item for the dataset with label '-1 STD (hidden)'
      return legendItem.text !== "-1 STD (hidden)";
    },
  };

  irradianceChart.options.plugins.title.display = false; // Hide any previous message title
  irradianceChart.update(); // Update the chart with average data and config
}
