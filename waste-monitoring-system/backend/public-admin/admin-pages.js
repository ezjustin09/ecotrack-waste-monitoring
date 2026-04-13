const STORAGE_KEY = "wm_admin_token";
const SESSION_KEY = "wm_admin_token_session";

const state = {
  token: "",
  payload: null,
  searchTerm: "",
  isLoading: false,
  drivers: [],
  tripTickets: [],
  charts: {
    tripStatus: null,
    barangayLoad: null,
    truckPerformance: null,
  },
  map: {
    instance: null,
    markers: new Map(),
    hasFit: false,
    userMoved: false,
  },
  reportPictureById: new Map(),
};

function getStoredToken() {
  return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(SESSION_KEY) || "";
}

function clearStoredToken() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
    "Content-Type": "application/json",
  };
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTimeInputValue(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatCount(value) {
  return new Intl.NumberFormat("en-PH").format(Number(value || 0));
}

function formatDurationMinutes(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "-";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!remainingMinutes) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function formatKilograms(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "0 kg";
  }

  return `${new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: amount >= 100 ? 0 : 1,
  }).format(amount)} kg`;
}

function destroyAnalyticsChart(chartKey) {
  const activeChart = state.charts?.[chartKey];
  if (activeChart && typeof activeChart.destroy === "function") {
    activeChart.destroy();
  }

  if (state.charts) {
    state.charts[chartKey] = null;
  }
}

function renderAnalyticsChart(chartKey, options = {}) {
  const canvas = document.getElementById(options.canvasId || "");
  const emptyNode = document.getElementById(options.emptyId || "");
  const labels = Array.isArray(options.labels) ? options.labels : [];
  const values = Array.isArray(options.values) ? options.values : [];
  const emptyMessage = options.emptyMessage || "No data available yet.";

  if (!canvas) {
    return;
  }

  const hasData = labels.length > 0 && values.length > 0 && values.some((value) => Number(value || 0) > 0);

  if (!window.Chart || !hasData) {
    destroyAnalyticsChart(chartKey);
    canvas.classList.add("hidden");

    if (emptyNode) {
      emptyNode.textContent = emptyMessage;
      emptyNode.classList.remove("hidden");
    }
    return;
  }

  canvas.classList.remove("hidden");
  if (emptyNode) {
    emptyNode.classList.add("hidden");
  }

  destroyAnalyticsChart(chartKey);

  state.charts[chartKey] = new window.Chart(canvas.getContext("2d"), {
    type: options.type || "bar",
    data: {
      labels,
      datasets: options.datasets || [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: options.showLegend !== false,
          position: options.legendPosition || "bottom",
          labels: {
            boxWidth: 12,
            usePointStyle: true,
          },
        },
      },
      ...options.chartOptions,
    },
  });
}

function truncate(text, max = 58) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}
function isOpenablePictureUri(pictureUri) {
  const normalized = String(pictureUri || "").trim().toLowerCase();

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:image/")
  );
}

function isLocalOnlyPictureUri(pictureUri) {
  const normalized = String(pictureUri || "").trim().toLowerCase();

  return (
    normalized.startsWith("file://") ||
    normalized.startsWith("content://") ||
    normalized.startsWith("ph://") ||
    normalized.startsWith("assets-library://")
  );
}

function openPicturePreviewWindow(pictureUri, reportId = "") {
  const previewWindow = window.open("about:blank", "_blank");

  if (!previewWindow) {
    window.alert("Popup blocked. Please allow popups to preview report pictures.");
    return;
  }

  const doc = previewWindow.document;
  const title = reportId ? `Report ${reportId} Picture` : "Report Picture";

  doc.title = title;
  doc.body.innerHTML = "";
  doc.body.style.margin = "0";
  doc.body.style.minHeight = "100vh";
  doc.body.style.display = "flex";
  doc.body.style.alignItems = "center";
  doc.body.style.justifyContent = "center";
  doc.body.style.background = "#0f172a";

  const img = doc.createElement("img");
  img.src = pictureUri;
  img.alt = title;
  img.style.maxWidth = "100vw";
  img.style.maxHeight = "100vh";
  img.style.objectFit = "contain";

  doc.body.appendChild(img);
}

function renderPictureCell(reportId, pictureUri) {
  const normalized = String(pictureUri || "").trim();

  if (!normalized) {
    return "-";
  }

  if (isLocalOnlyPictureUri(normalized)) {
    return '<span class="picture-unavailable" title="This image points to a phone-local file path and cannot be opened in web.">Unavailable</span>';
  }

  if (!isOpenablePictureUri(normalized)) {
    return '<span class="picture-unavailable">Invalid link</span>';
  }

  if (normalized.toLowerCase().startsWith("data:image/")) {
    state.reportPictureById.set(String(reportId || ""), normalized);
    return `<button type="button" class="picture-link picture-preview-btn" data-preview-report-id="${reportId}">Open</button>`;
  }

  return `<a class="picture-link" href="${normalized}" target="_blank" rel="noreferrer">Open</a>`;
}

function setMenuActive() {
  const page = document.body.dataset.page;
  const links = Array.from(document.querySelectorAll("[data-page-link]"));
  links.forEach((link) => {
    link.classList.toggle("active", link.dataset.pageLink === page);
  });
}

function filterBySearch(list, fields) {
  if (!state.searchTerm) {
    return list;
  }

  const needle = state.searchTerm.toLowerCase();

  return list.filter((item) =>
    fields.some((field) => String(field(item) || "").toLowerCase().includes(needle))
  );
}

function renderStats(payload) {
  const stats = payload?.stats || {};
  const tripAnalytics = payload?.tripAnalytics || {};

  const activeTrucks = document.getElementById("activeTrucks");
  const reportsToday = document.getElementById("reportsToday");
  const reportsTotal = document.getElementById("reportsTotal");
  const scheduleTotal = document.getElementById("scheduleTotal");
  const tripTicketsToday = document.getElementById("tripTicketsToday");
  const completedTrips = document.getElementById("completedTrips");
  const averageTripDuration = document.getElementById("averageTripDuration");
  const lastSync = document.getElementById("lastSync");

  if (activeTrucks) {
    activeTrucks.textContent = formatCount(stats.activeTrucks || 0);
  }
  if (reportsToday) {
    reportsToday.textContent = formatCount(stats.reportsToday || 0);
  }
  if (reportsTotal) {
    reportsTotal.textContent = formatCount(stats.reportsTotal || 0);
  }
  if (scheduleTotal) {
    scheduleTotal.textContent = formatCount((payload.schedule || []).length);
  }
  if (tripTicketsToday) {
    tripTicketsToday.textContent = formatCount(
      tripAnalytics.ticketsToday ?? stats.tripTicketsToday ?? 0
    );
  }
  if (completedTrips) {
    completedTrips.textContent = formatCount(
      tripAnalytics.completedTrips ?? stats.completedTrips ?? 0
    );
  }
  if (averageTripDuration) {
    const durationLabel = formatDurationMinutes(
      tripAnalytics.averageDurationMinutes ?? stats.averageTripDurationMinutes ?? 0
    );
    averageTripDuration.textContent = durationLabel === "-" ? "0m" : durationLabel;
  }
  if (lastSync) {
    lastSync.textContent = formatDateTime(payload.generatedAt);
  }
}

function renderStatusBreakdown(statusMap = {}) {
  const chipsNode = document.getElementById("statusChips");
  const barsNode = document.getElementById("statusBars");

  if (!chipsNode && !barsNode) {
    return;
  }

  const entries = Object.entries(statusMap);
  if (!entries.length) {
    if (chipsNode) {
      chipsNode.innerHTML = '<span class="empty">No active trucks yet.</span>';
    }
    if (barsNode) {
      barsNode.innerHTML = '<p class="empty">No status data available.</p>';
    }
    return;
  }

  const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);

  if (chipsNode) {
    chipsNode.innerHTML = entries
      .map(([status, count]) => `<span class="status-chip">${status}: ${count}</span>`)
      .join("");
  }

  if (barsNode) {
    barsNode.innerHTML = entries
      .map(([status, count]) => {
        const percent = total > 0 ? Math.round((Number(count || 0) / total) * 100) : 0;
        return `
          <article class="bar-item">
            <div class="bar-label-row"><span>${status}</span><strong>${count} (${percent}%)</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width: ${percent}%"></div></div>
          </article>
        `;
      })
      .join("");
  }
}

function getFilteredTrucks(trucks = []) {
  return filterBySearch(trucks, [
    (truck) => truck.truckId,
    (truck) => truck.status,
    (truck) => `${truck.latitude},${truck.longitude}`,
  ]);
}

function getTruckStatusColor(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("collect")) {
    return "#16a34a";
  }

  if (normalized.includes("route") || normalized.includes("transit") || normalized.includes("moving")) {
    return "#2563eb";
  }

  if (normalized.includes("idle") || normalized.includes("wait")) {
    return "#d97706";
  }

  if (normalized.includes("maint") || normalized.includes("offline")) {
    return "#dc2626";
  }

  return "#0f766e";
}

function setMapStatusMessage(message, isError = false) {
  const messageNode = document.getElementById("mapStatus");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.classList.toggle("error", Boolean(isError && message));
}

function ensureLiveMap() {
  const mapNode = document.getElementById("adminLiveMap");
  if (!mapNode) {
    return null;
  }

  if (state.map.instance) {
    return state.map.instance;
  }

  if (!window.L) {
    setMapStatusMessage("Map library unavailable. Check internet connection for map tiles.", true);
    return null;
  }

  const initialCenter = [14.5586, 121.0684];
  const map = window.L.map(mapNode, {
    zoomControl: true,
    preferCanvas: true,
  }).setView(initialCenter, 13);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  map.on("dragstart", () => {
    state.map.userMoved = true;
  });

  map.on("zoomstart", () => {
    state.map.userMoved = true;
  });

  state.map.instance = map;
  window.setTimeout(() => map.invalidateSize(), 140);
  return map;
}

function getValidTruckCoordinates(trucks = []) {
  return trucks
    .map((truck) => ({
      ...truck,
      latitude: Number(truck.latitude),
      longitude: Number(truck.longitude),
    }))
    .filter((truck) => Number.isFinite(truck.latitude) && Number.isFinite(truck.longitude));
}

function fitMapToTrucks(trucks = [], forceReset = false) {
  const map = ensureLiveMap();
  if (!map) {
    return;
  }

  const validTrucks = getValidTruckCoordinates(getFilteredTrucks(trucks));

  if (!validTrucks.length) {
    if (forceReset) {
      map.setView([14.5586, 121.0684], 13);
      state.map.hasFit = true;
      state.map.userMoved = false;
    }
    return;
  }

  if (validTrucks.length === 1) {
    map.setView([validTrucks[0].latitude, validTrucks[0].longitude], 15);
  } else {
    const bounds = window.L.latLngBounds(validTrucks.map((truck) => [truck.latitude, truck.longitude]));
    map.fitBounds(bounds.pad(0.24), { maxZoom: 16 });
  }

  state.map.hasFit = true;
  if (forceReset) {
    state.map.userMoved = false;
  }
}

function renderLiveMap(trucks = []) {
  const summaryNode = document.getElementById("mapSummary");
  const map = ensureLiveMap();
  const filtered = getFilteredTrucks(trucks);
  const validTrucks = getValidTruckCoordinates(filtered);

  if (summaryNode) {
    const suffix = validTrucks.length === 1 ? "" : "s";
    summaryNode.textContent = `${validTrucks.length} visible truck${suffix}`;
  }

  if (!map) {
    return;
  }

  const visibleIds = new Set();
  for (const truck of validTrucks) {
    visibleIds.add(truck.truckId);

    const pinColor = getTruckStatusColor(truck.status);
    const markerIcon = window.L.divIcon({
      className: "admin-truck-marker",
      html: `
        <div class="truck-pin-shell" style="--truck-color: ${pinColor};">
          <span class="truck-pin-glow"></span>
          <img class="truck-pin-image" src="./truck-marker.png" alt="" />
        </div>
      `,
      iconSize: [52, 72],
      iconAnchor: [26, 66],
      popupAnchor: [0, -58],
    });

    const popupHtml = `
      <strong>${truck.truckId || "Unknown"}</strong><br/>
      ${truck.status || "Unknown status"}<br/>
      ${truck.latitude.toFixed(5)}, ${truck.longitude.toFixed(5)}<br/>
      ${formatDateTime(truck.updatedAt)}
    `;

    const existingMarker = state.map.markers.get(truck.truckId);
    if (existingMarker) {
      existingMarker.setLatLng([truck.latitude, truck.longitude]);
      existingMarker.setIcon(markerIcon);
      existingMarker.bindPopup(popupHtml);
    } else {
      const marker = window.L.marker([truck.latitude, truck.longitude], {
        icon: markerIcon,
        title: truck.truckId,
      }).addTo(map);
      marker.bindPopup(popupHtml);
      state.map.markers.set(truck.truckId, marker);
    }
  }

  for (const [truckId, marker] of state.map.markers.entries()) {
    if (!visibleIds.has(truckId)) {
      map.removeLayer(marker);
      state.map.markers.delete(truckId);
    }
  }

  if (!validTrucks.length) {
    setMapStatusMessage("No trucks with GPS coordinates available right now.");
    return;
  }

  setMapStatusMessage(`Live map updated ${formatDateTime(new Date().toISOString())}`);

  if (!state.map.hasFit || !state.map.userMoved) {
    fitMapToTrucks(validTrucks, !state.map.hasFit);
  }
}

function renderTrucks(trucks = []) {
  const tableBody = document.getElementById("truckTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = getFilteredTrucks(trucks);

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty">No truck matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map((truck) => {
      const coords = Number.isFinite(truck.latitude) && Number.isFinite(truck.longitude)
        ? `${truck.latitude.toFixed(5)}, ${truck.longitude.toFixed(5)}`
        : "-";
      return `
        <tr>
          <td data-label="Truck ID">${truck.truckId}</td>
          <td data-label="Status">${truck.status || "Unknown"}</td>
          <td data-label="Coordinates">${coords}</td>
          <td data-label="Last Updated">${formatDateTime(truck.updatedAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderReports(reports = []) {
  const tableBody = document.getElementById("reportTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(reports, [
    (report) => report.id,
    (report) => report.issueType,
    (report) => report.location?.barangay,
    (report) => report.location?.street,
    (report) => report.contactNumber,
  ]);

  state.reportPictureById.clear();

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No report matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .slice(0, 60)
    .map((report) => {
      const pictureCell = renderPictureCell(report.id, report.pictureUri);

      return `
        <tr>
          <td>${report.id}</td>
          <td>${report.issueType || "-"}${report.notes ? `<br /><small>${truncate(report.notes, 48)}</small>` : ""}</td>
          <td>${report.location?.barangay || "-"}, ${report.location?.street || "-"}</td>
          <td>${report.contactNumber || "-"}</td>
          <td>${pictureCell}</td>
          <td>${formatDateTime(report.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSchedule(schedule = []) {
  const listNode = document.getElementById("scheduleList");
  if (!listNode) {
    return;
  }

  const filtered = filterBySearch(schedule, [
    (item) => item.id,
    (item) => item.day,
    (item) => item.zone,
    (item) => item.wasteType,
    (item) => item.notes,
  ]);

  if (!filtered.length) {
    listNode.innerHTML = '<p class="empty">No schedule matches your search.</p>';
    return;
  }

  const isManagementPage = document.body.dataset.page === "schedule";

  listNode.innerHTML = filtered
    .map((item) => {
      const actions = isManagementPage
        ? `
          <div class="schedule-item-actions">
            <button type="button" class="schedule-edit-btn" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" class="schedule-delete-btn" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        `
        : "";

      return `
        <article class="schedule-item">
          <h3>${item.id} - ${item.day}</h3>
          <p>${item.zone}</p>
          <p>${item.timeWindow} - ${item.wasteType}</p>
          <p>${item.notes || "No notes"}</p>
          ${actions}
        </article>
      `;
    })
    .join("");
}


function renderAnnouncements(announcements = []) {
  const tableBody = document.getElementById("announcementTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(announcements, [
    (item) => item.id,
    (item) => item.title,
    (item) => item.details,
  ]);

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty">No announcement matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map(
      (item) => `
        <tr>
          <td>${item.id}</td>
          <td>${item.title}</td>
          <td>${truncate(item.details, 80) || "-"}</td>
          <td>${formatDateTime(item.createdAt)}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="schedule-edit-btn" data-announcement-action="edit" data-announcement-id="${item.id}">Edit</button>
              <button type="button" class="schedule-delete-btn" data-announcement-action="delete" data-announcement-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderNews(news = []) {
  const tableBody = document.getElementById("newsTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(news, [
    (item) => item.id,
    (item) => item.title,
    (item) => item.details,
  ]);

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty">No news matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map(
      (item) => `
        <tr>
          <td>${item.id}</td>
          <td>${item.title}</td>
          <td>${truncate(item.details, 80) || "-"}</td>
          <td>${formatDateTime(item.createdAt)}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="schedule-edit-btn" data-news-action="edit" data-news-id="${item.id}">Edit</button>
              <button type="button" class="schedule-delete-btn" data-news-action="delete" data-news-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}
function renderDrivers(drivers = []) {
  const tableBody = document.getElementById("driverTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(drivers, [
    (driver) => driver.id,
    (driver) => driver.name,
    (driver) => driver.email,
    (driver) => driver.truckId,
  ]);

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No driver matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map(
      (driver) => `
        <tr>
          <td>${driver.id}</td>
          <td>${driver.name}</td>
          <td>${driver.email}</td>
          <td>${driver.truckId || "-"}</td>
          <td>${formatDateTime(driver.createdAt)}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="schedule-edit-btn" data-driver-action="edit" data-driver-id="${driver.id}">Edit</button>
              <button type="button" class="schedule-delete-btn" data-driver-action="delete" data-driver-id="${driver.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}
function renderRecentActivity(reports = [], trucks = []) {
  const activityNode = document.getElementById("recentActivity");
  if (!activityNode) {
    return;
  }

  const reportActivity = reports.slice(0, 4).map((report) => ({
    title: `New ${report.issueType || "issue"} report`,
    meta: `${report.location?.barangay || "Unknown barangay"} - ${formatDateTime(report.createdAt)}`,
    timestamp: new Date(report.createdAt || 0).getTime(),
  }));

  const truckActivity = trucks.slice(0, 4).map((truck) => ({
    title: `${truck.truckId} is ${truck.status || "active"}`,
    meta: `${formatDateTime(truck.updatedAt)} - ${Number.isFinite(truck.latitude) ? truck.latitude.toFixed(4) : "-"}, ${Number.isFinite(truck.longitude) ? truck.longitude.toFixed(4) : "-"}`,
    timestamp: new Date(truck.updatedAt || 0).getTime(),
  }));

  const combined = [...reportActivity, ...truckActivity]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);

  if (!combined.length) {
    activityNode.innerHTML = '<li class="empty">No recent activity yet.</li>';
    return;
  }

  activityNode.innerHTML = combined
    .map(
      (item) => `
        <li>
          <div class="activity-title">${item.title}</div>
          <div class="activity-meta">${item.meta}</div>
        </li>
      `
    )
    .join("");
}

function renderTripTicketAnalytics(payload = {}) {
  const analytics = payload?.tripAnalytics || {};
  const tripTickets = Array.isArray(payload?.tripTickets) ? payload.tripTickets : [];
  const tripInsightChips = document.getElementById("tripInsightChips");
  const tripTicketTableBody = document.getElementById("tripTicketTableBody");

  if (!tripInsightChips && !tripTicketTableBody) {
    return;
  }

  if (tripInsightChips) {
    const chips = [
      `Completion Rate: ${Number(analytics.completionRate || 0)}%`,
      `Delayed Trips: ${formatCount(analytics.delayedTrips || 0)}`,
      `In Progress: ${formatCount(analytics.inProgressTrips || 0)}`,
      `Total Volume: ${formatKilograms(analytics.totalVolumeKg || 0)}`,
      `Trucks Covered: ${formatCount(analytics.trucksCovered || 0)}`,
    ];

    tripInsightChips.innerHTML = chips
      .map((chip) => `<span class="status-chip">${chip}</span>`)
      .join("");
  }

  const statusBreakdown = Array.isArray(analytics.statusBreakdown) ? analytics.statusBreakdown : [];
  const barangayBreakdown = Array.isArray(analytics.barangayBreakdown)
    ? analytics.barangayBreakdown
    : Array.isArray(analytics.zoneBreakdown)
      ? analytics.zoneBreakdown
      : [];
  const truckPerformance = Array.isArray(analytics.truckPerformance) ? analytics.truckPerformance.slice(0, 7) : [];

  renderAnalyticsChart("tripStatus", {
    canvasId: "tripStatusChart",
    emptyId: "tripStatusChartEmpty",
    emptyMessage: "No trip ticket status data yet.",
    type: "doughnut",
    labels: statusBreakdown.map((item) => item.label),
    values: statusBreakdown.map((item) => Number(item.count || 0)),
    datasets: [
      {
        data: statusBreakdown.map((item) => Number(item.count || 0)),
        backgroundColor: ["#16a34a", "#f59e0b", "#2563eb", "#ef4444", "#0f766e", "#7c3aed"],
        borderWidth: 0,
      },
    ],
    chartOptions: {
      cutout: "58%",
    },
  });

  renderAnalyticsChart("barangayLoad", {
    canvasId: "barangayLoadChart",
    emptyId: "barangayLoadChartEmpty",
    emptyMessage: "No barangay coverage data yet.",
    type: "bar",
    labels: barangayBreakdown.map((item) => item.label),
    values: barangayBreakdown.map((item) => Number(item.count || 0)),
    datasets: [
      {
        label: "Trips",
        data: barangayBreakdown.map((item) => Number(item.count || 0)),
        backgroundColor: "#2c8e37",
        borderRadius: 8,
        maxBarThickness: 34,
      },
    ],
    showLegend: false,
    chartOptions: {
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
        },
      },
    },
  });

  renderAnalyticsChart("truckPerformance", {
    canvasId: "truckPerformanceChart",
    emptyId: "truckPerformanceChartEmpty",
    emptyMessage: "No truck performance data yet.",
    type: "bar",
    labels: truckPerformance.map((truck) => truck.truckId),
    values: truckPerformance.map((truck) => Number(truck.trips || 0)),
    datasets: [
      {
        label: "Trips",
        data: truckPerformance.map((truck) => Number(truck.trips || 0)),
        backgroundColor: "#0f766e",
        borderRadius: 8,
      },
      {
        label: "Completion Rate",
        data: truckPerformance.map((truck) => Number(truck.completionRate || 0)),
        backgroundColor: "#93c5fd",
        borderRadius: 8,
      },
    ],
    chartOptions: {
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
        },
        y: {
          grid: {
            display: false,
          },
        },
      },
    },
  });

  if (tripTicketTableBody) {
    const filteredTickets = filterBySearch(tripTickets, [
      (ticket) => ticket.id,
      (ticket) => ticket.truckId,
      (ticket) => ticket.driverName,
      (ticket) => ticket.barangay || ticket.zone,
      (ticket) => ticket.status,
      (ticket) => ticket.wasteType,
      (ticket) => ticket.remarks,
    ]);

    if (!filteredTickets.length) {
      tripTicketTableBody.innerHTML = '<tr><td colspan="8" class="empty">No trip ticket matches your search.</td></tr>';
    } else {
      tripTicketTableBody.innerHTML = filteredTickets
        .map(
          (ticket) => `
            <tr>
              <td>${ticket.id}</td>
              <td>${ticket.truckId}</td>
              <td>${ticket.driverName || "-"}</td>
              <td>${ticket.barangay || ticket.zone || "-"}</td>
              <td>${ticket.status || "-"}</td>
              <td>${formatDurationMinutes(ticket.durationMinutes)}</td>
              <td>${formatKilograms(ticket.volumeKg)}</td>
              <td>${formatDateTime(ticket.completedAt || ticket.departureAt)}</td>
            </tr>
          `
        )
        .join("");
    }
  }
}

function renderTripTicketDriverOptions() {
  const driverOptionsNode = document.getElementById("tripTicketDriverOptions");
  const truckOptionsNode = document.getElementById("tripTicketTruckOptions");

  if (!driverOptionsNode && !truckOptionsNode) {
    return;
  }

  const drivers = Array.isArray(state.drivers) ? state.drivers : [];

  if (driverOptionsNode) {
    driverOptionsNode.innerHTML = drivers
      .map(
        (driver) =>
          `<option value="${driver.name}" label="${[driver.truckId, driver.email].filter(Boolean).join(" - ")}"></option>`
      )
      .join("");
  }

  if (truckOptionsNode) {
    const truckIds = Array.from(
      new Set(
        [
          ...drivers.map((driver) => String(driver.truckId || "").trim()).filter(Boolean),
          ...state.tripTickets.map((ticket) => String(ticket.truckId || "").trim()).filter(Boolean),
        ].sort()
      )
    );

    truckOptionsNode.innerHTML = truckIds.map((truckId) => `<option value="${truckId}"></option>`).join("");
  }
}

function renderTripTicketManagement(tripTickets = []) {
  const tableBody = document.getElementById("tripTicketManagementTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(tripTickets, [
    (ticket) => ticket.id,
    (ticket) => ticket.truckId,
    (ticket) => ticket.driverName,
    (ticket) => ticket.barangay || ticket.zone,
    (ticket) => ticket.wasteType,
    (ticket) => ticket.scheduledWindow,
    (ticket) => ticket.status,
    (ticket) => ticket.remarks,
  ]);

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="10" class="empty">No trip ticket matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map((ticket) => {
      const statusMeta = [formatKilograms(ticket.volumeKg), formatDurationMinutes(ticket.durationMinutes)]
        .filter((value) => value && value !== "-")
        .join(" • ");

      return `
        <tr>
          <td>${ticket.id}</td>
          <td>${ticket.truckId || "-"}</td>
          <td>${ticket.driverName || "-"}</td>
          <td>${ticket.barangay || ticket.zone || "-"}</td>
          <td>${ticket.wasteType || "-"}${ticket.remarks ? `<br /><small>${truncate(ticket.remarks, 44)}</small>` : ""}</td>
          <td>${ticket.scheduledWindow || "-"}</td>
          <td>${formatDateTime(ticket.departureAt)}</td>
          <td>${ticket.completedAt ? formatDateTime(ticket.completedAt) : "-"}</td>
          <td>${ticket.status || "-"}${statusMeta ? `<br /><small>${statusMeta}</small>` : ""}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="schedule-edit-btn" data-trip-ticket-action="edit" data-trip-ticket-id="${ticket.id}">Edit</button>
              <button type="button" class="schedule-delete-btn" data-trip-ticket-action="delete" data-trip-ticket-id="${ticket.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function setTripTicketForm(ticket = null) {
  const idInput = document.getElementById("tripTicketEditingId");
  const truckIdInput = document.getElementById("tripTicketTruckId");
  const driverNameInput = document.getElementById("tripTicketDriverName");
  const barangayInput = document.getElementById("tripTicketBarangay");
  const wasteTypeInput = document.getElementById("tripTicketWasteType");
  const scheduledWindowInput = document.getElementById("tripTicketScheduledWindow");
  const departureAtInput = document.getElementById("tripTicketDepartureAt");
  const completedAtInput = document.getElementById("tripTicketCompletedAt");
  const statusInput = document.getElementById("tripTicketStatus");
  const volumeKgInput = document.getElementById("tripTicketVolumeKg");
  const remarksInput = document.getElementById("tripTicketRemarks");
  const saveButton = document.getElementById("tripTicketSaveButton");

  if (
    !idInput ||
    !truckIdInput ||
    !driverNameInput ||
    !barangayInput ||
    !wasteTypeInput ||
    !scheduledWindowInput ||
    !departureAtInput ||
    !completedAtInput ||
    !statusInput ||
    !volumeKgInput ||
    !remarksInput
  ) {
    return;
  }

  if (!ticket) {
    idInput.value = "";
    truckIdInput.value = "";
    driverNameInput.value = "";
    barangayInput.value = "";
    wasteTypeInput.value = "";
    scheduledWindowInput.value = "";
    departureAtInput.value = "";
    completedAtInput.value = "";
    statusInput.value = "Scheduled";
    volumeKgInput.value = "";
    remarksInput.value = "";
    if (saveButton) {
      saveButton.textContent = "Save Trip Ticket";
    }
    return;
  }

  idInput.value = ticket.id || "";
  truckIdInput.value = ticket.truckId || "";
  driverNameInput.value = ticket.driverName || "";
  barangayInput.value = ticket.barangay || ticket.zone || "";
  wasteTypeInput.value = ticket.wasteType || "";
  scheduledWindowInput.value = ticket.scheduledWindow || "";
  departureAtInput.value = formatDateTimeInputValue(ticket.departureAt);
  completedAtInput.value = formatDateTimeInputValue(ticket.completedAt);
  statusInput.value = ticket.status || "Scheduled";
  volumeKgInput.value = Number.isFinite(Number(ticket.volumeKg)) && Number(ticket.volumeKg) > 0 ? String(ticket.volumeKg) : "";
  remarksInput.value = ticket.remarks || "";
  if (saveButton) {
    saveButton.textContent = `Update ${ticket.id}`;
  }
}

function showTripTicketMessage(message, isError = false) {
  const messageNode = document.getElementById("tripTicketMessage");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.style.color = isError ? "#b91c1c" : "#166534";
}

function getTripTicketById(ticketId) {
  return (state.tripTickets || []).find((ticket) => ticket.id === ticketId) || null;
}

async function tripTicketRequest(url, method, body = null) {
  return adminRequest(url, method, body);
}

async function fetchTripTickets() {
  if (!state.token) {
    return;
  }

  try {
    const payload = await tripTicketRequest("/admin/trip-tickets", "GET");
    state.tripTickets = payload.tripTickets || [];
    renderTripTicketDriverOptions();
    renderTripTicketManagement(state.tripTickets);
  } catch (error) {
    showTripTicketMessage(error.message || "Unable to load trip tickets.", true);
  }
}

function syncTripTicketDriverFields(source = "name") {
  const truckIdInput = document.getElementById("tripTicketTruckId");
  const driverNameInput = document.getElementById("tripTicketDriverName");

  if (!truckIdInput || !driverNameInput) {
    return;
  }

  const normalizedDriverName = String(driverNameInput.value || "").trim().toLowerCase();
  const normalizedTruckId = String(truckIdInput.value || "").trim().toUpperCase();

  if (source === "name" && normalizedDriverName) {
    const match = state.drivers.find((driver) => String(driver.name || "").trim().toLowerCase() === normalizedDriverName);
    if (match?.truckId) {
      truckIdInput.value = match.truckId;
    }
    return;
  }

  if (source === "truck" && normalizedTruckId) {
    const match = state.drivers.find((driver) => String(driver.truckId || "").trim().toUpperCase() === normalizedTruckId);
    if (match?.name) {
      driverNameInput.value = match.name;
    }
  }
}

function setupTripTicketManagement() {
  const form = document.getElementById("tripTicketForm");
  const cancelButton = document.getElementById("tripTicketCancelButton");
  const tableBody = document.getElementById("tripTicketManagementTableBody");
  const driverNameInput = document.getElementById("tripTicketDriverName");
  const truckIdInput = document.getElementById("tripTicketTruckId");

  if (!form || !tableBody) {
    return;
  }

  if (driverNameInput && driverNameInput.dataset.tripTicketBound !== "1") {
    driverNameInput.dataset.tripTicketBound = "1";
    driverNameInput.addEventListener("change", () => syncTripTicketDriverFields("name"));
    driverNameInput.addEventListener("blur", () => syncTripTicketDriverFields("name"));
  }

  if (truckIdInput && truckIdInput.dataset.tripTicketBound !== "1") {
    truckIdInput.dataset.tripTicketBound = "1";
    truckIdInput.addEventListener("change", () => syncTripTicketDriverFields("truck"));
    truckIdInput.addEventListener("blur", () => syncTripTicketDriverFields("truck"));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const editingId = String(document.getElementById("tripTicketEditingId")?.value || "").trim();
    const body = {
      truckId: String(document.getElementById("tripTicketTruckId")?.value || "").trim(),
      driverName: String(document.getElementById("tripTicketDriverName")?.value || "").trim(),
      barangay: String(document.getElementById("tripTicketBarangay")?.value || "").trim(),
      wasteType: String(document.getElementById("tripTicketWasteType")?.value || "").trim(),
      scheduledWindow: String(document.getElementById("tripTicketScheduledWindow")?.value || "").trim(),
      departureAt: document.getElementById("tripTicketDepartureAt")?.value
        ? new Date(document.getElementById("tripTicketDepartureAt").value).toISOString()
        : "",
      completedAt: document.getElementById("tripTicketCompletedAt")?.value
        ? new Date(document.getElementById("tripTicketCompletedAt").value).toISOString()
        : "",
      status: String(document.getElementById("tripTicketStatus")?.value || "").trim(),
      volumeKg: String(document.getElementById("tripTicketVolumeKg")?.value || "").trim(),
      remarks: String(document.getElementById("tripTicketRemarks")?.value || "").trim(),
    };

    if (!body.truckId || !body.driverName || !body.barangay || !body.wasteType || !body.scheduledWindow || !body.departureAt) {
      showTripTicketMessage("Please fill truck, driver, barangay, waste type, schedule window, and departure time.", true);
      return;
    }

    if (["Completed", "Delayed"].includes(body.status) && !body.completedAt) {
      showTripTicketMessage("Completed or delayed tickets need a completed time.", true);
      return;
    }

    try {
      if (editingId) {
        await tripTicketRequest(`/admin/trip-tickets/${encodeURIComponent(editingId)}`, "PUT", body);
        showTripTicketMessage(`Trip ticket ${editingId} updated.`);
      } else {
        const created = await tripTicketRequest("/admin/trip-tickets", "POST", body);
        showTripTicketMessage(`Trip ticket ${created?.tripTicket?.id || ""} added.`);
      }

      setTripTicketForm(null);
      await refreshCurrentPageData();
    } catch (error) {
      showTripTicketMessage(error.message || "Unable to save trip ticket.", true);
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      setTripTicketForm(null);
      showTripTicketMessage("");
    });
  }

  tableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-trip-ticket-action");
    const tripTicketId = String(target.getAttribute("data-trip-ticket-id") || "").trim();

    if (!action || !tripTicketId) {
      return;
    }

    if (action === "edit") {
      const tripTicket = getTripTicketById(tripTicketId);
      if (!tripTicket) {
        showTripTicketMessage("Trip ticket not found.", true);
        return;
      }

      setTripTicketForm(tripTicket);
      showTripTicketMessage(`Editing ${tripTicketId}.`);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete trip ticket ${tripTicketId}?`);
      if (!confirmed) {
        return;
      }

      try {
        await tripTicketRequest(`/admin/trip-tickets/${encodeURIComponent(tripTicketId)}`, "DELETE");
        showTripTicketMessage(`Trip ticket ${tripTicketId} deleted.`);
        if (document.getElementById("tripTicketEditingId")?.value === tripTicketId) {
          setTripTicketForm(null);
        }
        await refreshCurrentPageData();
      } catch (error) {
        showTripTicketMessage(error.message || "Unable to delete trip ticket.", true);
      }
    }
  });
}

function setScheduleForm(schedule = null) {
  const idInput = document.getElementById("scheduleEditingId");
  const dayInput = document.getElementById("scheduleDay");
  const zoneInput = document.getElementById("scheduleZone");
  const timeWindowInput = document.getElementById("scheduleTimeWindow");
  const wasteTypeInput = document.getElementById("scheduleWasteType");
  const notesInput = document.getElementById("scheduleNotes");
  const saveButton = document.getElementById("scheduleSaveButton");

  if (!idInput || !dayInput || !zoneInput || !timeWindowInput || !wasteTypeInput || !notesInput) {
    return;
  }

  if (!schedule) {
    idInput.value = "";
    dayInput.value = "";
    zoneInput.value = "";
    timeWindowInput.value = "";
    wasteTypeInput.value = "";
    notesInput.value = "";
    if (saveButton) {
      saveButton.textContent = "Save Schedule";
    }
    return;
  }

  idInput.value = schedule.id || "";
  dayInput.value = schedule.day || "";
  zoneInput.value = schedule.zone || "";
  timeWindowInput.value = schedule.timeWindow || "";
  wasteTypeInput.value = schedule.wasteType || "";
  notesInput.value = schedule.notes || "";
  if (saveButton) {
    saveButton.textContent = `Update ${schedule.id}`;
  }
}

function showScheduleMessage(message, isError = false) {
  const messageNode = document.getElementById("scheduleMessage");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.style.color = isError ? "#b91c1c" : "#166534";
}

function getScheduleById(scheduleId) {
  const schedules = state.payload?.schedule || [];
  return schedules.find((item) => item.id === scheduleId) || null;
}

async function adminRequest(url, method, body = null) {
  const options = {
    method,
    headers: getAuthHeaders(),
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    clearStoredToken();
    window.location.replace("/admin");
    throw new Error("Session expired");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function scheduleRequest(url, method, body = null) {
  return adminRequest(url, method, body);
}
function setupScheduleManagement() {
  const scheduleForm = document.getElementById("scheduleForm");
  const cancelButton = document.getElementById("scheduleCancelButton");
  const scheduleList = document.getElementById("scheduleList");

  if (!scheduleForm || !scheduleList) {
    return;
  }

  scheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const idInput = document.getElementById("scheduleEditingId");
    const dayInput = document.getElementById("scheduleDay");
    const zoneInput = document.getElementById("scheduleZone");
    const timeWindowInput = document.getElementById("scheduleTimeWindow");
    const wasteTypeInput = document.getElementById("scheduleWasteType");
    const notesInput = document.getElementById("scheduleNotes");

    const body = {
      day: String(dayInput?.value || "").trim(),
      zone: String(zoneInput?.value || "").trim(),
      timeWindow: String(timeWindowInput?.value || "").trim(),
      wasteType: String(wasteTypeInput?.value || "").trim(),
      notes: String(notesInput?.value || "").trim(),
    };

    if (!body.day || !body.zone || !body.timeWindow || !body.wasteType) {
      showScheduleMessage("Please fill day, zone, time window, and waste type.", true);
      return;
    }

    try {
      const editingId = String(idInput?.value || "").trim();
      if (editingId) {
        await scheduleRequest(`/admin/schedules/${encodeURIComponent(editingId)}`, "PUT", body);
        showScheduleMessage(`Schedule ${editingId} updated.`);
      } else {
        const created = await scheduleRequest("/admin/schedules", "POST", body);
        showScheduleMessage(`Schedule ${created?.schedule?.id || ""} added.`);
      }

      setScheduleForm(null);
      await fetchDashboard();
    } catch (error) {
      showScheduleMessage(error.message || "Unable to save schedule.", true);
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      setScheduleForm(null);
      showScheduleMessage("");
    });
  }

  scheduleList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-action");
    const scheduleId = String(target.getAttribute("data-id") || "").trim();

    if (!action || !scheduleId) {
      return;
    }

    if (action === "edit") {
      const schedule = getScheduleById(scheduleId);
      if (!schedule) {
        showScheduleMessage("Schedule not found.", true);
        return;
      }

      setScheduleForm(schedule);
      showScheduleMessage(`Editing ${scheduleId}.`);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete schedule ${scheduleId}?`);
      if (!confirmed) {
        return;
      }

      try {
        await scheduleRequest(`/admin/schedules/${encodeURIComponent(scheduleId)}`, "DELETE");
        showScheduleMessage(`Schedule ${scheduleId} deleted.`);
        if (document.getElementById("scheduleEditingId")?.value === scheduleId) {
          setScheduleForm(null);
        }
        await fetchDashboard();
      } catch (error) {
        showScheduleMessage(error.message || "Unable to delete schedule.", true);
      }
    }
  });
}


function setAnnouncementForm(announcement = null) {
  const idInput = document.getElementById("announcementEditingId");
  const titleInput = document.getElementById("announcementTitle");
  const detailsInput = document.getElementById("announcementDetails");
  const saveButton = document.getElementById("announcementSaveButton");

  if (!idInput || !titleInput || !detailsInput) {
    return;
  }

  if (!announcement) {
    idInput.value = "";
    titleInput.value = "";
    detailsInput.value = "";
    if (saveButton) {
      saveButton.textContent = "Save Announcement";
    }
    return;
  }

  idInput.value = announcement.id || "";
  titleInput.value = announcement.title || "";
  detailsInput.value = announcement.details || "";
  if (saveButton) {
    saveButton.textContent = `Update ${announcement.id}`;
  }
}

function showAnnouncementMessage(message, isError = false) {
  const messageNode = document.getElementById("announcementMessage");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.style.color = isError ? "#b91c1c" : "#166534";
}

function getAnnouncementById(id) {
  const announcements = state.payload?.announcements || [];
  return announcements.find((item) => item.id === id) || null;
}

function setupAnnouncementManagement() {
  const form = document.getElementById("announcementForm");
  const cancelButton = document.getElementById("announcementCancelButton");
  const tableBody = document.getElementById("announcementTableBody");

  if (!form || !tableBody) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const idInput = document.getElementById("announcementEditingId");
    const titleInput = document.getElementById("announcementTitle");
    const detailsInput = document.getElementById("announcementDetails");

    const body = {
      title: String(titleInput?.value || "").trim(),
      details: String(detailsInput?.value || "").trim(),
    };

    if (!body.title || !body.details) {
      showAnnouncementMessage("Please fill both title and details.", true);
      return;
    }

    try {
      const editingId = String(idInput?.value || "").trim();
      if (editingId) {
        await adminRequest(`/admin/announcements/${encodeURIComponent(editingId)}`, "PUT", body);
        showAnnouncementMessage(`Announcement ${editingId} updated.`);
      } else {
        const created = await adminRequest("/admin/announcements", "POST", body);
        showAnnouncementMessage(`Announcement ${created?.announcement?.id || ""} added.`);
      }

      setAnnouncementForm(null);
      await fetchDashboard();
    } catch (error) {
      showAnnouncementMessage(error.message || "Unable to save announcement.", true);
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      setAnnouncementForm(null);
      showAnnouncementMessage("");
    });
  }

  tableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-announcement-action");
    const announcementId = String(target.getAttribute("data-announcement-id") || "").trim();

    if (!action || !announcementId) {
      return;
    }

    if (action === "edit") {
      const announcement = getAnnouncementById(announcementId);
      if (!announcement) {
        showAnnouncementMessage("Announcement not found.", true);
        return;
      }

      setAnnouncementForm(announcement);
      showAnnouncementMessage(`Editing ${announcementId}.`);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete announcement ${announcementId}?`);
      if (!confirmed) {
        return;
      }

      try {
        await adminRequest(`/admin/announcements/${encodeURIComponent(announcementId)}`, "DELETE");
        showAnnouncementMessage(`Announcement ${announcementId} deleted.`);
        if (document.getElementById("announcementEditingId")?.value === announcementId) {
          setAnnouncementForm(null);
        }
        await fetchDashboard();
      } catch (error) {
        showAnnouncementMessage(error.message || "Unable to delete announcement.", true);
      }
    }
  });
}

function setNewsForm(newsItem = null) {
  const idInput = document.getElementById("newsEditingId");
  const titleInput = document.getElementById("newsTitle");
  const detailsInput = document.getElementById("newsDetails");
  const saveButton = document.getElementById("newsSaveButton");

  if (!idInput || !titleInput || !detailsInput) {
    return;
  }

  if (!newsItem) {
    idInput.value = "";
    titleInput.value = "";
    detailsInput.value = "";
    if (saveButton) {
      saveButton.textContent = "Save News";
    }
    return;
  }

  idInput.value = newsItem.id || "";
  titleInput.value = newsItem.title || "";
  detailsInput.value = newsItem.details || "";
  if (saveButton) {
    saveButton.textContent = `Update ${newsItem.id}`;
  }
}

function showNewsMessage(message, isError = false) {
  const messageNode = document.getElementById("newsMessage");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.style.color = isError ? "#b91c1c" : "#166534";
}

function getNewsById(id) {
  const news = state.payload?.news || [];
  return news.find((item) => item.id === id) || null;
}

function setupNewsManagement() {
  const form = document.getElementById("newsForm");
  const cancelButton = document.getElementById("newsCancelButton");
  const tableBody = document.getElementById("newsTableBody");

  if (!form || !tableBody) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const idInput = document.getElementById("newsEditingId");
    const titleInput = document.getElementById("newsTitle");
    const detailsInput = document.getElementById("newsDetails");

    const body = {
      title: String(titleInput?.value || "").trim(),
      details: String(detailsInput?.value || "").trim(),
    };

    if (!body.title || !body.details) {
      showNewsMessage("Please fill both title and details.", true);
      return;
    }

    try {
      const editingId = String(idInput?.value || "").trim();
      if (editingId) {
        await adminRequest(`/admin/news/${encodeURIComponent(editingId)}`, "PUT", body);
        showNewsMessage(`News ${editingId} updated.`);
      } else {
        const created = await adminRequest("/admin/news", "POST", body);
        showNewsMessage(`News ${created?.news?.id || ""} added.`);
      }

      setNewsForm(null);
      await fetchDashboard();
    } catch (error) {
      showNewsMessage(error.message || "Unable to save news.", true);
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      setNewsForm(null);
      showNewsMessage("");
    });
  }

  tableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-news-action");
    const newsId = String(target.getAttribute("data-news-id") || "").trim();

    if (!action || !newsId) {
      return;
    }

    if (action === "edit") {
      const newsItem = getNewsById(newsId);
      if (!newsItem) {
        showNewsMessage("News item not found.", true);
        return;
      }

      setNewsForm(newsItem);
      showNewsMessage(`Editing ${newsId}.`);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete news ${newsId}?`);
      if (!confirmed) {
        return;
      }

      try {
        await adminRequest(`/admin/news/${encodeURIComponent(newsId)}`, "DELETE");
        showNewsMessage(`News ${newsId} deleted.`);
        if (document.getElementById("newsEditingId")?.value === newsId) {
          setNewsForm(null);
        }
        await fetchDashboard();
      } catch (error) {
        showNewsMessage(error.message || "Unable to delete news.", true);
      }
    }
  });
}
function setDriverForm(driver = null) {
  const idInput = document.getElementById("driverEditingId");
  const nameInput = document.getElementById("driverName");
  const emailInput = document.getElementById("driverEmail");
  const passwordInput = document.getElementById("driverPassword");
  const truckIdInput = document.getElementById("driverTruckId");
  const saveButton = document.getElementById("driverSaveButton");

  if (!idInput || !nameInput || !emailInput || !passwordInput || !truckIdInput) {
    return;
  }

  if (!driver) {
    idInput.value = "";
    nameInput.value = "";
    emailInput.value = "";
    passwordInput.value = "";
    truckIdInput.value = "";
    if (saveButton) {
      saveButton.textContent = "Save Driver";
    }
    return;
  }

  idInput.value = driver.id || "";
  nameInput.value = driver.name || "";
  emailInput.value = driver.email || "";
  passwordInput.value = "";
  truckIdInput.value = driver.truckId || "";
  if (saveButton) {
    saveButton.textContent = `Update ${driver.id}`;
  }
}

function showDriverMessage(message, isError = false) {
  const messageNode = document.getElementById("driverMessage");
  if (!messageNode) {
    return;
  }

  messageNode.textContent = message;
  messageNode.style.color = isError ? "#b91c1c" : "#166534";
}

function getDriverById(driverId) {
  return (state.drivers || []).find((driver) => driver.id === driverId) || null;
}

async function driverRequest(url, method, body = null) {
  return adminRequest(url, method, body);
}
async function fetchDrivers() {
  if (!state.token) {
    return;
  }

  try {
    const payload = await driverRequest("/admin/drivers", "GET");
    state.drivers = payload.drivers || [];
    renderDrivers(state.drivers);
    renderTripTicketDriverOptions();
  } catch (error) {
    showDriverMessage(error.message || "Unable to load drivers.", true);
  }
}

function setupDriverManagement() {
  const driverForm = document.getElementById("driverForm");
  const driverCancelButton = document.getElementById("driverCancelButton");
  const driverTableBody = document.getElementById("driverTableBody");

  if (!driverForm || !driverTableBody) {
    return;
  }

  driverForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const idInput = document.getElementById("driverEditingId");
    const nameInput = document.getElementById("driverName");
    const emailInput = document.getElementById("driverEmail");
    const passwordInput = document.getElementById("driverPassword");
    const truckIdInput = document.getElementById("driverTruckId");

    const body = {
      name: String(nameInput?.value || "").trim(),
      email: String(emailInput?.value || "").trim(),
      password: String(passwordInput?.value || "").trim(),
      truckId: String(truckIdInput?.value || "").trim(),
    };

    if (!body.name || !body.email || !body.truckId) {
      showDriverMessage("Please fill name, email, and truck ID.", true);
      return;
    }

    try {
      const editingId = String(idInput?.value || "").trim();

      if (editingId) {
        if (!body.password) {
          delete body.password;
        }

        await driverRequest(`/admin/drivers/${encodeURIComponent(editingId)}`, "PUT", body);
        showDriverMessage(`Driver ${editingId} updated.`);
      } else {
        if (!body.password) {
          showDriverMessage("Password is required for new drivers.", true);
          return;
        }

        const created = await driverRequest("/admin/drivers", "POST", body);
        showDriverMessage(`Driver ${created?.driver?.id || ""} added.`);
      }

      setDriverForm(null);
      await fetchDrivers();
    } catch (error) {
      showDriverMessage(error.message || "Unable to save driver.", true);
    }
  });

  if (driverCancelButton) {
    driverCancelButton.addEventListener("click", () => {
      setDriverForm(null);
      showDriverMessage("");
    });
  }

  driverTableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-driver-action");
    const driverId = String(target.getAttribute("data-driver-id") || "").trim();

    if (!action || !driverId) {
      return;
    }

    if (action === "edit") {
      const driver = getDriverById(driverId);
      if (!driver) {
        showDriverMessage("Driver not found.", true);
        return;
      }

      setDriverForm(driver);
      showDriverMessage(`Editing ${driverId}.`);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete driver ${driverId}?`);
      if (!confirmed) {
        return;
      }

      try {
        await driverRequest(`/admin/drivers/${encodeURIComponent(driverId)}`, "DELETE");
        showDriverMessage(`Driver ${driverId} deleted.`);
        if (document.getElementById("driverEditingId")?.value === driverId) {
          setDriverForm(null);
        }
        await fetchDrivers();
      } catch (error) {
        showDriverMessage(error.message || "Unable to delete driver.", true);
      }
    }
  });

}
async function renderBackendInfo() {
  const dbType = document.getElementById("dbType");
  const dbName = document.getElementById("dbName");

  if (!dbType && !dbName) {
    return;
  }

  try {
    const response = await fetch("/");
    const payload = await response.json();

    if (dbType) {
      dbType.textContent = payload?.database?.type || "unknown";
    }

    if (dbName) {
      dbName.textContent = payload?.database?.name || "n/a";
    }
  } catch (error) {
    if (dbType) {
      dbType.textContent = "unavailable";
    }
    if (dbName) {
      dbName.textContent = "unavailable";
    }
  }
}

function formatDiagnosticEvent(event) {
  if (!event) {
    return "No data yet";
  }

  const parts = [];

  if (event.timestamp) {
    parts.push(formatDateTime(event.timestamp));
  }

  if (event.status) {
    parts.push(`status: ${event.status}`);
  }

  if (event.kind) {
    parts.push(`kind: ${event.kind}`);
  }

  if (event.feedId) {
    parts.push(`feed: ${event.feedId}`);
  }

  if (event.userId) {
    parts.push(`user: ${event.userId}`);
  }

  if (event.platform) {
    parts.push(`platform: ${event.platform}`);
  }

  if (event.pushToken) {
    parts.push(`token: ${event.pushToken}`);
  }

  if (typeof event.availableTokenCount === "number") {
    parts.push(`available tokens: ${event.availableTokenCount}`);
  }

  if (typeof event.requested === "number") {
    parts.push(`requested: ${event.requested}`);
  }

  if (typeof event.accepted === "number") {
    parts.push(`accepted: ${event.accepted}`);
  }

  if (typeof event.ticketCount === "number") {
    parts.push(`tickets: ${event.ticketCount}`);
  }

  if (typeof event.receiptCheckedCount === "number") {
    parts.push(`receipts: ${event.receiptCheckedCount}`);
  }

  if (typeof event.dropped === "number") {
    parts.push(`dropped: ${event.dropped}`);
  }

  if (typeof event.modifiedCount === "number") {
    parts.push(`modified: ${event.modifiedCount}`);
  }

  return parts.join(" | ") || "No data yet";
}

async function renderPushDiagnostics() {
  const pushConfigStatusNode = document.getElementById("pushConfigStatus");
  const registeredTokenCountNode = document.getElementById("pushRegisteredTokenCount");
  const tokenSamplesNode = document.getElementById("pushTokenSamples");
  const lastRegistrationNode = document.getElementById("pushLastRegistration");
  const lastRemovalNode = document.getElementById("pushLastRemoval");
  const lastLocationSyncNode = document.getElementById("pushLastLocationSync");
  const lastNearbyTruckAlertNode = document.getElementById("pushLastNearbyTruckAlert");
  const lastBroadcastNode = document.getElementById("pushLastBroadcast");
  const lastErrorsNode = document.getElementById("pushLastErrors");
  const lastNearbyErrorsNode = document.getElementById("pushLastNearbyErrors");

  if (
    !pushConfigStatusNode &&
    !registeredTokenCountNode &&
    !tokenSamplesNode &&
    !lastRegistrationNode &&
    !lastRemovalNode &&
    !lastLocationSyncNode &&
    !lastNearbyTruckAlertNode &&
    !lastBroadcastNode &&
    !lastErrorsNode &&
    !lastNearbyErrorsNode
  ) {
    return;
  }

  try {
    const payload = await adminRequest("/admin/push/status", "GET");

    if (pushConfigStatusNode) {
      pushConfigStatusNode.textContent = payload?.configured?.expoPushAccessTokenPresent ? "Configured" : "Not configured";
    }

    if (registeredTokenCountNode) {
      registeredTokenCountNode.textContent = String(payload?.registeredTokenCount ?? 0);
    }

    if (tokenSamplesNode) {
      const samples = Array.isArray(payload?.registeredTokenSamples) ? payload.registeredTokenSamples : [];
      tokenSamplesNode.textContent = samples.length > 0 ? samples.join(", ") : "No registered tokens";
    }

    if (lastRegistrationNode) {
      lastRegistrationNode.textContent = formatDiagnosticEvent(payload?.lastRegistration);
    }

    if (lastRemovalNode) {
      lastRemovalNode.textContent = formatDiagnosticEvent(payload?.lastRemoval);
    }

    if (lastLocationSyncNode) {
      lastLocationSyncNode.textContent = formatDiagnosticEvent(payload?.lastLocationSync);
    }

    if (lastNearbyTruckAlertNode) {
      lastNearbyTruckAlertNode.textContent = formatDiagnosticEvent(payload?.lastNearbyTruckAlert);
    }

    if (lastBroadcastNode) {
      lastBroadcastNode.textContent = formatDiagnosticEvent(payload?.lastBroadcast);
    }

    if (lastErrorsNode) {
      const errors = Array.isArray(payload?.lastBroadcast?.errors) ? payload.lastBroadcast.errors : [];
      lastErrorsNode.textContent = errors.length > 0 ? JSON.stringify(errors, null, 2) : "No push errors recorded";
    }

    if (lastNearbyErrorsNode) {
      const errors = Array.isArray(payload?.lastNearbyTruckAlert?.errors) ? payload.lastNearbyTruckAlert.errors : [];
      lastNearbyErrorsNode.textContent =
        errors.length > 0 ? JSON.stringify(errors, null, 2) : "No nearby alert errors recorded";
    }
  } catch (error) {
    const fallbackMessage = error.message || "Unable to load push diagnostics.";

    if (pushConfigStatusNode) {
      pushConfigStatusNode.textContent = fallbackMessage;
    }

    if (registeredTokenCountNode) {
      registeredTokenCountNode.textContent = "unavailable";
    }

    if (tokenSamplesNode) {
      tokenSamplesNode.textContent = fallbackMessage;
    }

    if (lastRegistrationNode) {
      lastRegistrationNode.textContent = fallbackMessage;
    }

    if (lastRemovalNode) {
      lastRemovalNode.textContent = fallbackMessage;
    }

    if (lastLocationSyncNode) {
      lastLocationSyncNode.textContent = fallbackMessage;
    }

    if (lastNearbyTruckAlertNode) {
      lastNearbyTruckAlertNode.textContent = fallbackMessage;
    }

    if (lastBroadcastNode) {
      lastBroadcastNode.textContent = fallbackMessage;
    }

    if (lastErrorsNode) {
      lastErrorsNode.textContent = fallbackMessage;
    }

    if (lastNearbyErrorsNode) {
      lastNearbyErrorsNode.textContent = fallbackMessage;
    }
  }
}

function applyPayload(payload) {
  state.payload = payload || {};
  state.tripTickets = Array.isArray(state.payload?.tripTickets) ? state.payload.tripTickets : state.tripTickets;

  renderStats(state.payload);
  renderStatusBreakdown(state.payload?.stats?.byStatus || {});
  renderLiveMap(state.payload?.trucks || []);
  renderTrucks(state.payload?.trucks || []);
  renderReports(state.payload?.reports || []);
  renderSchedule(state.payload?.schedule || []);
  renderAnnouncements(state.payload?.announcements || []);
  renderNews(state.payload?.news || []);
  renderTripTicketAnalytics(state.payload);
  renderTripTicketDriverOptions();
  renderTripTicketManagement(state.tripTickets || []);
  renderRecentActivity(state.payload?.reports || [], state.payload?.trucks || []);
}
async function fetchDashboard() {
  if (!state.token || state.isLoading) {
    return;
  }

  state.isLoading = true;
  const refreshButton = document.getElementById("refreshButton");

  try {
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Refreshing...";
    }

    const response = await fetch("/admin/dashboard", {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    });

    if (response.status === 401) {
      clearStoredToken();
      window.location.replace("/admin");
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to load admin dashboard.");
    }

    const payload = await response.json();
    applyPayload(payload);
    await renderBackendInfo();
    await renderPushDiagnostics();
  } catch (error) {
    const chipsNode = document.getElementById("statusChips");
    if (chipsNode && !state.payload) {
      chipsNode.innerHTML = `<span class="empty">${error.message}</span>`;
    }
  } finally {
    state.isLoading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh";
    }
  }
}

function handleLogout(sendRequest = true) {
  const currentToken = state.token;
  state.token = "";
  clearStoredToken();

  if (sendRequest && currentToken) {
    fetch("/admin/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    }).catch(() => {});
  }

  window.location.replace("/admin");
}

function setupRealtime() {
  if (!window.io) {
    return;
  }

  const socket = window.io();
  const refresh = () => refreshCurrentPageData();

  socket.on("truck:updated", refresh);
  socket.on("truck:removed", refresh);
  socket.on("trucks:snapshot", refresh);
  socket.on("report:created", refresh);
  socket.on("trip-ticket:created", refresh);
  socket.on("trip-ticket:updated", refresh);
  socket.on("trip-ticket:deleted", refresh);
}

function setupReportPicturePreview() {
  const tableBody = document.getElementById("reportTableBody");
  if (!tableBody || tableBody.dataset.previewBound === "1") {
    return;
  }

  tableBody.dataset.previewBound = "1";

  tableBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest("[data-preview-report-id]");
    if (!trigger) {
      return;
    }

    const reportId = String(trigger.getAttribute("data-preview-report-id") || "").trim();
    const pictureUri = state.reportPictureById.get(reportId) || "";

    if (!pictureUri) {
      window.alert("Picture is unavailable for this report.");
      return;
    }

    openPicturePreviewWindow(pictureUri, reportId);
  });
}
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", (event) => {
    state.searchTerm = String(event.target.value || "").trim();

    if (state.payload) {
      renderLiveMap(state.payload.trucks || []);
      renderTrucks(state.payload.trucks || []);
      renderReports(state.payload.reports || []);
      renderSchedule(state.payload.schedule || []);
      renderAnnouncements(state.payload.announcements || []);
      renderNews(state.payload.news || []);
      renderTripTicketAnalytics(state.payload);
    }

    renderDrivers(state.drivers || []);
    renderTripTicketManagement(state.tripTickets || []);
  });
}

async function refreshCurrentPageData() {
  const page = document.body.dataset.page || "";
  const tasks = [fetchDashboard()];

  if (page === "drivers" || page === "trip-tickets") {
    tasks.push(fetchDrivers());
  }

  if (page === "trip-tickets") {
    tasks.push(fetchTripTickets());
  }

  await Promise.all(tasks);
}

function setupScrollIndicators() {
  const scrollTables = Array.from(document.querySelectorAll(".scroll-table-wrap"));

  scrollTables.forEach((container) => {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    let indicator = container.nextElementSibling;
    if (!(indicator instanceof HTMLElement) || !indicator.classList.contains("table-scroll-indicator")) {
      indicator = document.createElement("div");
      indicator.className = "table-scroll-indicator";
      indicator.setAttribute("aria-hidden", "true");

      const thumb = document.createElement("span");
      thumb.className = "table-scroll-indicator-thumb";
      indicator.appendChild(thumb);
      container.insertAdjacentElement("afterend", indicator);
    }

    const thumb = indicator.querySelector(".table-scroll-indicator-thumb");
    if (!(thumb instanceof HTMLElement)) {
      return;
    }

    const updateIndicator = () => {
      const maxScroll = Math.max(container.scrollWidth - container.clientWidth, 0);
      if (maxScroll <= 1) {
        indicator.hidden = true;
        thumb.style.width = "";
        thumb.style.transform = "translateX(0)";
        return;
      }

      indicator.hidden = false;
      const trackWidth = indicator.clientWidth || container.clientWidth;
      const thumbWidth = Math.max(Math.round(trackWidth * (container.clientWidth / container.scrollWidth)), 72);
      const clampedThumbWidth = Math.min(thumbWidth, trackWidth);
      const maxThumbTravel = Math.max(trackWidth - clampedThumbWidth, 0);
      const scrollRatio = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
      const thumbOffset = maxThumbTravel * scrollRatio;

      thumb.style.width = `${clampedThumbWidth}px`;
      thumb.style.transform = `translateX(${thumbOffset}px)`;
    };

    if (container.dataset.scrollIndicatorBound !== "1") {
      container.dataset.scrollIndicatorBound = "1";
      container.addEventListener("scroll", updateIndicator, { passive: true });

      let dragState = null;

      indicator.addEventListener("pointerdown", (event) => {
        const maxScroll = Math.max(container.scrollWidth - container.clientWidth, 0);
        const trackRect = indicator.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();

        if (maxScroll <= 1 || trackRect.width <= 0) {
          return;
        }

        const pointerOffset = event.clientX - trackRect.left;
        const thumbLeft = thumbRect.left - trackRect.left;
        const thumbWidth = thumbRect.width;
        const clickedThumb = pointerOffset >= thumbLeft && pointerOffset <= thumbLeft + thumbWidth;
        const maxThumbTravel = Math.max(trackRect.width - thumbWidth, 1);

        if (!clickedThumb) {
          const targetThumbLeft = Math.max(0, Math.min(pointerOffset - thumbWidth / 2, trackRect.width - thumbWidth));
          const targetRatio = targetThumbLeft / maxThumbTravel;
          container.scrollLeft = targetRatio * maxScroll;
        }

        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: container.scrollLeft,
          maxScroll,
          maxThumbTravel,
        };

        indicator.setPointerCapture(event.pointerId);
      });

      indicator.addEventListener("pointermove", (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        const deltaX = event.clientX - dragState.startX;
        const scrollDelta = (deltaX / dragState.maxThumbTravel) * dragState.maxScroll;
        container.scrollLeft = Math.max(0, Math.min(dragState.startScrollLeft + scrollDelta, dragState.maxScroll));
      });

      const releaseDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        if (indicator.hasPointerCapture(event.pointerId)) {
          indicator.releasePointerCapture(event.pointerId);
        }

        dragState = null;
      };

      indicator.addEventListener("pointerup", releaseDrag);
      indicator.addEventListener("pointercancel", releaseDrag);

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateIndicator);
        observer.observe(container);
        const table = container.querySelector("table");
        if (table instanceof HTMLElement) {
          observer.observe(table);
        }
      } else {
        window.addEventListener("resize", updateIndicator);
      }
    }

    window.requestAnimationFrame(updateIndicator);
  });
}

function setupResponsiveSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const topbar = document.querySelector(".topbar");
  const titleNode = topbar?.querySelector("h1");

  if (!sidebar || !topbar || !titleNode || topbar.dataset.sidebarBound === "1") {
    return;
  }

  topbar.dataset.sidebarBound = "1";

  let topbarHeader = topbar.querySelector(".topbar-header");
  if (!topbarHeader) {
    topbarHeader = document.createElement("div");
    topbarHeader.className = "topbar-header";
    topbar.insertBefore(topbarHeader, topbar.firstChild);
  }

  const navToggleButton = document.createElement("button");
  navToggleButton.type = "button";
  navToggleButton.className = "nav-toggle-button";
  navToggleButton.setAttribute("aria-label", "Open navigation menu");
  navToggleButton.setAttribute("aria-expanded", "false");
  navToggleButton.innerHTML = "<span></span><span></span><span></span>";

  topbarHeader.appendChild(navToggleButton);
  topbarHeader.appendChild(titleNode);

  const sidebarOverlay = document.createElement("button");
  sidebarOverlay.type = "button";
  sidebarOverlay.className = "sidebar-overlay";
  sidebarOverlay.setAttribute("aria-label", "Close navigation menu");

  document.body.appendChild(sidebarOverlay);

  const mobileMedia = window.matchMedia("(max-width: 1100px)");

  titleNode.classList.add("topbar-title-trigger");

  function closeSidebar() {
    document.body.classList.remove("admin-nav-open");
    navToggleButton.setAttribute("aria-expanded", "false");
    navToggleButton.setAttribute("aria-label", "Open navigation menu");
  }

  function openSidebar() {
    document.body.classList.add("admin-nav-open");
    navToggleButton.setAttribute("aria-expanded", "true");
    navToggleButton.setAttribute("aria-label", "Close navigation menu");
  }

  navToggleButton.addEventListener("click", () => {
    if (!mobileMedia.matches) {
      return;
    }

    const isOpen = document.body.classList.contains("admin-nav-open");
    if (isOpen) {
      closeSidebar();
      return;
    }

    openSidebar();
  });

  sidebarOverlay.addEventListener("click", closeSidebar);

  sidebar.querySelectorAll(".menu-item").forEach((link) => {
    link.addEventListener("click", () => {
      if (mobileMedia.matches) {
        closeSidebar();
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

  mobileMedia.addEventListener("change", (event) => {
    if (!event.matches) {
      closeSidebar();
    }
  });
}

function bootstrap() {
  state.token = getStoredToken();

  if (!state.token) {
    window.location.replace("/admin");
    return;
  }

  setMenuActive();
  setupResponsiveSidebar();

  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => handleLogout(true));
  }

  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => refreshCurrentPageData());
  }

  const mapFitButton = document.getElementById("mapFitButton");
  if (mapFitButton) {
    mapFitButton.addEventListener("click", () => {
      fitMapToTrucks(state.payload?.trucks || [], true);
      renderLiveMap(state.payload?.trucks || []);
    });
  }

  setupReportPicturePreview();
  setupSearch();
  setupScrollIndicators();
  setupScheduleManagement();
  setupAnnouncementManagement();
  setupNewsManagement();
  setupDriverManagement();
  setupTripTicketManagement();
  setupRealtime();
  refreshCurrentPageData();
  window.setInterval(refreshCurrentPageData, 30000);
}

bootstrap();














