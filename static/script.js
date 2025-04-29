// ----------------------------------MAP section -----------------------------
let map = null;

let maker = null;

document.addEventListener("DOMContentLoaded", function () {
  // Initialize map
  map = L.map("map").setView([0.31166, 32.5974], 8);

  // Add OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Add cursor coordinates display
  const cursorCoords = document.getElementById("cursorCoords");
  map.on("mousemove", function (e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    cursorCoords.textContent = `${lat}, ${lng}`;
  });

  // Add click handler
  map.on("click", function (e) {
    document.getElementById("latitudeInput").value = e.latlng.lat.toFixed(4);
    document.getElementById("longitudeInput").value = e.latlng.lng.toFixed(4);
    document.getElementById("selectedCoords").textContent =
      e.latlng.lat.toFixed(4) + ", " + e.latlng.lng.toFixed(4);
  });

// Add click handler - Now also adds/updates a marker
  let clickedMarker = null;

  map.on("click", function (e) {
    const clickedLat = e.latlng.lat.toFixed(4);
    const clickedLng = e.latlng.lng.toFixed(4);

    // Update input fields and display text
    document.getElementById("latitudeInput").value = clickedLat;
    document.getElementById("longitudeInput").value = clickedLng;
    document.getElementById("selectedCoords").textContent =
      `${clickedLat}, ${clickedLng}`;

    // --- Add/Update Marker Logic ---
    // Remove the previous marker if it exists
    if (clickedMarker) {
      map.removeLayer(clickedMarker);
      // Or you can use: clickedMarker.remove();
    }

    // Create a new marker at the clicked location, add it to the map,
    // and store its reference in clickedMarker
    clickedMarker = L.marker(e.latlng).addTo(map);
    // --- End Marker Logic ---

  });

  // Add search functionality
  document.getElementById("searchBtn").addEventListener("click", function () {
    const query = document.getElementById("searchInput").value;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          map.setView([lat, lon], 13);
        }
      });
  });

  // --------------Chart ---------------------------

  // Add event listeners for visualization and download
  //document.getElementById("visualizeBtn").addEventListener("click", updateChart);
  //  document.getElementById("goBtn").addEventListener("click", updateChart);
  document.getElementById("downloadBtn").addEventListener("click", downloadData);
  document.getElementById("cancelBtn").addEventListener("click", resetForm);
  document.getElementById("downloadPdfBtn").addEventListener("click", downloadChartAsPDF);
});
document.addEventListener("DOMContentLoaded", function () {
  const chartConfig = {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Irradiance (W/m²)",
        data: [],
        borderColor: "#4e73df",
        backgroundColor: "rgba(78, 115, 223, 0.05)",
        borderWidth: 1,
        pointRadius: 2,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        zoom: {
          pan: { enabled: true },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true }
          }
        },
        tooltip: {
          callbacks: {
            title: (context) => {
              const date = context[0].label;
              return date
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            displayFormats: {
              hour: 'HH:mm',
              day: 'MMM d',
              month: 'MMM yyyy'
            }
          },
          title: { display: true, text: "Time" },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: "Irradiance (W/m²)" },
          beginAtZero: true
        }
      }
    }
  };

  // Initialize chart
  const ctx = document.getElementById("irradianceChart").getContext("2d");
  let irradianceChart = new Chart(ctx, chartConfig);

  // DOM elements
  const visualizeBtn = document.getElementById("visualizeBtn");
  const formInputs = document.querySelectorAll('.form-control, input[type="radio"]');

  // Event listeners
  visualizeBtn.addEventListener("click", async () => {
    try {
      // Show loading state
      visualizeBtn.disabled = true;
      visualizeBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Processing...';

      // Validate inputs
      const { valid, message } = validateInputs();
      if (!valid) throw new Error(message);

      // Get form data
      const params = getFormData();

      // Fetch data with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data?.data || !Array.isArray(data.data)) {
        throw new Error("Invalid data format received");
      }

      // Process and update chart
      updateChart(data.data, params.timeGranularity);

    } catch (error) {
      handleError(error);
    } finally {
      // Reset UI state
      visualizeBtn.disabled = false;
      visualizeBtn.innerHTML = '<i class="bi bi-eye me-1"></i>Visualize';
    }
  });

  // Input validation on change
  formInputs.forEach(input => {
    input.addEventListener('change', () => {
      const { valid } = validateInputs();
      visualizeBtn.disabled = !valid;
    });
  });

  // Helper functions
  function validateInputs() {
    const lat = parseFloat(document.getElementById("latitudeInput").value);
    const lon = parseFloat(document.getElementById("longitudeInput").value);
    const startDate = new Date(document.getElementById("startDate").value);
    const endDate = new Date(document.getElementById("endDate").value);

    if (isNaN(lat)) return { valid: false, message: "Invalid latitude value" };
    if (isNaN(lon)) return { valid: false, message: "Invalid longitude value" };
    if (lat < -90 || lat > 90) return { valid: false, message: "Latitude must be between -90 and 90" };
    if (lon < -180 || lon > 180) return { valid: false, message: "Longitude must be between -180 and 180" };
    if (startDate > endDate) return { valid: false, message: "Start date cannot be after end date" };

    return { valid: true };
  }

  function getFormData() {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    // Function to reformat date from DD/MM/YYYY to YYYY-MM-DD
    function formatDate(dateString) {
      if (!dateString) return null;
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
      return dateString;
    }

    const formattedStartDate = formatDate(startDate);
    const formattedEndDate = formatDate(endDate);



    return {
      latitude: parseFloat(document.getElementById("latitudeInput").value),
      longitude: parseFloat(document.getElementById("longitudeInput").value),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      timeGranularity: document.querySelector('input[name="Temporal Resolution"]:checked').value
    };
  }

  function updateChart(dataPoints, granularity) {
    updateSummary(granularity)
    // Map granularity to valid Chart.js time unit
    const timeUnitMap = {
      Hourly: "hour",
      Daily: "day",
      Monthly: "month"
    };
    const timeUnit = timeUnitMap[granularity];
    //downSample data incae os large dataset
    const maxPoints = {
      Hourly: 1000,
      Daily: 500,
      Monthly: 60
    }[granularity];

    // Downsample data if needed
    const sampledData = downsampleData(dataPoints, maxPoints);

    let labels = [];
    let values = [];

    if (granularity === 'Hourly') {
      labels = sampledData.map(point => new Date(point.datetime));
      values = sampledData.map(point => point.irradiance);
    } else if (granularity === 'Daily') {
      labels = sampledData.map(point => new Date(point.datetime));
      values = sampledData.map(point => point.irradiance);
    } else if (granularity === 'Monthly') {
      labels = sampledData.map(point => new Date(point.year, point.month - 1, 1));
      values = sampledData.map(point => point.irradiance);
    }

    irradianceChart.data.labels = labels;
    irradianceChart.data.datasets[0].data = values;
    irradianceChart.options.scales.x.time.unit = timeUnit;

    //Update chart label based on granularity
    let chartLabel = "Extraterrestrial Irradiance (W/m²)";
    if (granularity === 'Daily') {
      chartLabel = "Daily Total Extraterrestrial Irradiance (W/m²)";
    } else if (granularity === 'Monthly') {
      chartLabel = "Monthly Total Extraterrestrial Irradiance (W/m²)";
    }
    irradianceChart.data.datasets[0].label = chartLabel;
    irradianceChart.update();
  }

  function downsampleData(data, maxPoints) {
    if (data.length <= maxPoints) return data;
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, index) => index % step === 0);
  }

  function handleError(error) {
    console.error("Error:", error);
    const errorMessage = error.name === 'AbortError'
      ? "Request timed out. Try a smaller date range."
      : error.message || "Failed to fetch data";

    alert(`Error: ${errorMessage}`);
  }
});

//------------------- Update summary information-------------------------------
function updateSummary(granularity) {
  const lat = document.getElementById("latitudeInput").value;
  const lon = document.getElementById("longitudeInput").value;
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const data_source = document.getElementById("dataSource").value;

  document.querySelector('.summary-card .badge-latitude').textContent = `${lat}°N`;
  document.querySelector('.summary-card .badge-longitude').textContent = `${lon}°E`;
  document.querySelector('.summary-card .text-granularity').textContent = granularity;
  document.querySelector('.summary-card .text-start-date').textContent = startDate;
  document.querySelector('.summary-card .text-end-date').textContent = endDate;
  document.querySelector('.summary-card .text-data-source').textContent = data_source;
  document.querySelector('.summary-card .card-footer').textContent = `Last updated: ${new Date().toISOString()}`;
}
// ---------------------Function to download data-----------------------------
async function downloadData() {
  const params = {
    latitude: parseFloat(document.getElementById("latitudeInput").value),
    longitude: parseFloat(document.getElementById("longitudeInput").value),
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    // Fixed parameter name to match backend expectation
    timeGranularity: document.querySelector('input[name="Temporal Resolution"]:checked').value
  };

  const format = document.querySelector('input[name="outputFormat"]:checked').value;

  // Remove date formatting if using HTML5 date inputs (YYYY-MM-DD format)
  // Only keep this if you're using a different date format input
  function formatDate(dateString) {
    const [month, day, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Only format if using non-ISO dates (MM/DD/YYYY)
  if (params.startDate.includes('/')) {
    params.startDate = formatDate(params.startDate);
  }
  if (params.endDate.includes('/')) {
    params.endDate = formatDate(params.endDate);
  }

  try {
    const response = await fetch(`/api/export?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });

    // Handle backend errors with meaningful messages
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Download failed');
    }

    // Create filename with proper extension
    const filename = `solar_data_${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;

    // Handle both JSON and CSV downloads properly
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download error:", error);
    alert(`Download Error: ${error.message}`);
  }
}

// Function to reset the form
function resetForm() {
  document.getElementById("latitudeInput").value = "";
  document.getElementById("longitudeInput").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  document.getElementById("selectedCoords").textContent = "None selected";

  if (irradianceChart) {
    irradianceChart.destroy();
    irradianceChart = null;
  }

  map.setView([0.31166, 32.5974], 8);
}

// Function to download chart as PDF
function downloadChartAsPDF() {
  if (!irradianceChart) {
    alert("Please generate a chart first");
    return;
  }

  const canvas = document.getElementById("irradianceChart");
  const imageData = canvas.toDataURL("image/png");

  // Create a link element and trigger download
  const a = document.createElement("a");
  a.href = imageData;
  a.download = `solar_irradiance_chart_${new Date().toISOString().split('T')[0]}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

//--------Get CAMS Data -----------
async function fetchCAMSData() {
  const payload = {
    latitude: parseFloat(document.getElementById("latitudeInput").value),
    longitude: parseFloat(document.getElementById("longitudeInput").value),
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    temporal_resolution: document.querySelector('input[name="Temporal Resolution"]:checked').value,
    parameters: Array.from(document.querySelectorAll('input[name="parameters"]:checked')).map(cb => cb.value),
    data_source: document.getElementById('dataSource').value,
    action: action
  };

  fetch('/api/cams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      console.log("CAMS Data:", data);
      if (data.error) {
        alert(data.error);
      } else if (action === 'visualize') {
        ontimeupdate; // Function to update Chart.js
      } else if (action === 'download') {
        downloadData(data); // Function to trigger download
      }
    })
    .catch(error => console.error('Error:', error));
}
