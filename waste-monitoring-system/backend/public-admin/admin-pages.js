const STORAGE_KEY = "wm_admin_token";
const SESSION_KEY = "wm_admin_token_session";

const state = {
  token: "",
  payload: null,
  searchTerm: "",
  isLoading: false,
  drivers: [],
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

function renderTrucks(trucks = []) {
  const tableBody = document.getElementById("truckTableBody");
  if (!tableBody) {
    return;
  }

  const filtered = filterBySearch(trucks, [
    (truck) => truck.truckId,
    (truck) => truck.status,
    (truck) => `${truck.latitude},${truck.longitude}`,
  ]);

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

  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No report matches your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .slice(0, 60)
    .map((report) => {
      const pictureCell = report.pictureUri
        ? `<a class="picture-link" href="${report.pictureUri}" target="_blank" rel="noreferrer">Open</a>`
        : "-";

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

async function scheduleRequest(url, method, body = null) {
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

function applyPayload(payload) {
  state.payload = payload;

  renderStats(payload);
  renderStatusBreakdown(payload?.stats?.byStatus || {});
  renderTrucks(payload?.trucks || []);
  renderReports(payload?.reports || []);
  renderSchedule(payload?.schedule || []);
  renderRecentActivity(payload?.reports || [], payload?.trucks || []);
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

function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", (event) => {
    state.searchTerm = String(event.target.value || "").trim();

    if (state.payload) {
      renderTrucks(state.payload.trucks || []);
      renderReports(state.payload.reports || []);
      renderSchedule(state.payload.schedule || []);
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

  setupSearch();
  setupScheduleManagement();
  setupDriverManagement();
  setupRealtime();
  fetchDashboard();
  window.setInterval(fetchDashboard, 30000);
}

bootstrap();




