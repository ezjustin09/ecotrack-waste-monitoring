const STORAGE_KEY = "wm_admin_token";
const SESSION_KEY = "wm_admin_token_session";

const state = {
  token: "",
  payload: null,
  searchTerm: "",
  isLoading: false,
  drivers: [],
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

  const activeTrucks = document.getElementById("activeTrucks");
  const reportsToday = document.getElementById("reportsToday");
  const reportsTotal = document.getElementById("reportsTotal");
  const scheduleTotal = document.getElementById("scheduleTotal");
  const lastSync = document.getElementById("lastSync");

  if (activeTrucks) {
    activeTrucks.textContent = String(stats.activeTrucks || 0);
  }
  if (reportsToday) {
    reportsToday.textContent = String(stats.reportsToday || 0);
  }
  if (reportsTotal) {
    reportsTotal.textContent = String(stats.reportsTotal || 0);
  }
  if (scheduleTotal) {
    scheduleTotal.textContent = String((payload.schedule || []).length);
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
          <td>${truck.truckId}</td>
          <td>${truck.status || "Unknown"}</td>
          <td>${coords}</td>
          <td>${formatDateTime(truck.updatedAt)}</td>
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

  fetchDrivers();
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
  const lastBroadcastNode = document.getElementById("pushLastBroadcast");
  const lastErrorsNode = document.getElementById("pushLastErrors");

  if (
    !pushConfigStatusNode &&
    !registeredTokenCountNode &&
    !tokenSamplesNode &&
    !lastRegistrationNode &&
    !lastRemovalNode &&
    !lastBroadcastNode &&
    !lastErrorsNode
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

    if (lastBroadcastNode) {
      lastBroadcastNode.textContent = formatDiagnosticEvent(payload?.lastBroadcast);
    }

    if (lastErrorsNode) {
      const errors = Array.isArray(payload?.lastBroadcast?.errors) ? payload.lastBroadcast.errors : [];
      lastErrorsNode.textContent = errors.length > 0 ? JSON.stringify(errors, null, 2) : "No push errors recorded";
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

    if (lastBroadcastNode) {
      lastBroadcastNode.textContent = fallbackMessage;
    }

    if (lastErrorsNode) {
      lastErrorsNode.textContent = fallbackMessage;
    }
  }
}

function applyPayload(payload) {
  state.payload = payload || {};

  renderStats(state.payload);
  renderStatusBreakdown(state.payload?.stats?.byStatus || {});
  renderLiveMap(state.payload?.trucks || []);
  renderTrucks(state.payload?.trucks || []);
  renderReports(state.payload?.reports || []);
  renderSchedule(state.payload?.schedule || []);
  renderAnnouncements(state.payload?.announcements || []);
  renderNews(state.payload?.news || []);
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
  const refresh = () => fetchDashboard();

  socket.on("truck:updated", refresh);
  socket.on("truck:removed", refresh);
  socket.on("trucks:snapshot", refresh);
  socket.on("report:created", refresh);
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
    }

    renderDrivers(state.drivers || []);
  });
}
function bootstrap() {
  state.token = getStoredToken();

  if (!state.token) {
    window.location.replace("/admin");
    return;
  }

  setMenuActive();

  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => handleLogout(true));
  }

  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => fetchDashboard());
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
  setupScheduleManagement();
  setupAnnouncementManagement();
  setupNewsManagement();
  setupDriverManagement();
  setupRealtime();
  fetchDashboard();
  window.setInterval(fetchDashboard, 30000);
}

bootstrap();














