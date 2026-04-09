const appState = {
  view: "dashboard",
  dashboard: null,
  barangayFilter: "All",
  loading: false,
};

const dom = {
  appView: document.getElementById("appView"),
  lastSync: document.getElementById("lastSync"),
  schedulePanel: document.getElementById("schedulePanel"),
  statusBanner: document.getElementById("statusBanner"),
  toast: document.getElementById("toast"),
  refreshButton: document.getElementById("refreshButton"),
};

function formatDateTime(dateValue) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatRelativeTime(dateValue) {
  const diffMs = new Date(dateValue).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) {
    return `${Math.abs(diffMinutes)} min ${diffMinutes > 0 ? "from now" : "ago"}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${Math.abs(diffHours)} hr ${diffHours > 0 ? "from now" : "ago"}`;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    dom.toast.classList.remove("visible");
  }, 2600);
}

function statusClass(status) {
  return `status-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function issueClass(priority, status) {
  if (status === "Resolved") {
    return "issue-resolved";
  }

  return `issue-${String(priority).toLowerCase()}`;
}

async function request(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorPayload.error || "Request failed");
  }

  return response.json();
}

async function loadDashboard() {
  appState.loading = true;
  dom.refreshButton.disabled = true;
  dom.refreshButton.textContent = "Syncing...";

  try {
    const payload = await request("/api/dashboard");
    appState.dashboard = payload;
    renderSchedule(payload.schedule);
    renderBanner(payload);
    renderCurrentView();
    dom.lastSync.textContent = formatDateTime(payload.generatedAt);
  } catch (error) {
    dom.appView.innerHTML = `<section class="empty-state">Unable to load EcoTrack data. ${error.message}</section>`;
    showToast("Unable to load dashboard data.");
  } finally {
    appState.loading = false;
    dom.refreshButton.disabled = false;
    dom.refreshButton.textContent = "Refresh data";
  }
}

function renderSchedule(schedule) {
  dom.schedulePanel.innerHTML = schedule
    .map(
      (item) => `
        <article class="timeline-item">
          <div class="timeline-time">${item.time}</div>
          <strong>${item.label}</strong>
          <p class="timeline-detail">${item.detail}</p>
        </article>
      `
    )
    .join("");
}

function renderBanner(payload) {
  const { overview, issues, routes, city } = payload;
  const topIssue = issues.find((issue) => issue.status !== "Resolved");
  const delayedRoute = routes.find((route) => route.status === "Delayed");

  dom.statusBanner.innerHTML = `
    <div class="banner-grid">
      <div>
        <p class="eyebrow">Live operations</p>
        <h2>${city.name} is at ${overview.collectionRate}% collection completion this shift.</h2>
        <p>
          ${overview.completedStops} of ${overview.scheduledStops} scheduled stops are cleared across
          ${overview.activeFleet} active collection trucks.
        </p>
        <div class="banner-highlights">
          <span class="highlight-badge">${overview.tonnageCollected} tons collected</span>
          <span class="highlight-badge">${overview.diversionRate}% diversion rate</span>
          <span class="highlight-badge">${overview.unresolvedIssues} unresolved issues</span>
        </div>
      </div>
      <div class="alert-stack">
        <article class="alert-box">
          <strong>Immediate focus</strong>
          <span>${topIssue ? `${topIssue.barangay}: ${topIssue.title}` : "No open high-impact issues right now."}</span>
        </article>
        <article class="alert-box">
          <strong>Route watch</strong>
          <span>${delayedRoute ? `${delayedRoute.name} needs recovery support.` : "All routes are within target range."}</span>
        </article>
      </div>
    </div>
  `;
}

function metricCard(label, value, footnote) {
  return `
    <article class="metric-card">
      <p class="metric-label">${label}</p>
      <p class="metric-value">${value}</p>
      <span class="metric-footnote">${footnote}</span>
    </article>
  `;
}

function routeCard(route) {
  return `
    <article class="route-card">
      <div class="route-header">
        <div>
          <h3>${route.name}</h3>
          <p class="route-subtitle">${route.truck} � ${route.driver} � ${route.plateNumber}</p>
        </div>
        <span class="progress-pill ${statusClass(route.status)}">${route.status}</span>
      </div>

      <div class="progress-track" aria-label="${route.name} progress">
        <div class="progress-bar" style="width: ${route.progress}%"></div>
      </div>

      <div class="route-stats">
        <div class="mini-stat">
          <span class="mini-stat-label">Coverage</span>
          <strong>${route.completedStops}/${route.scheduledStops} stops</strong>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Collected</span>
          <strong>${route.tonnageCollected} tons</strong>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Barangays</span>
          <strong>${route.barangays.length}</strong>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Updated</span>
          <strong>${formatRelativeTime(route.lastUpdated)}</strong>
        </div>
      </div>

      <div>
        <p class="route-subtitle"><strong>Next checkpoint:</strong> ${route.nextCheckpoint}</p>
        <p class="route-subtitle">${route.notes}</p>
      </div>

      <div class="route-actions">
        <button class="action-button" type="button" data-action="advance-route" data-route-id="${route.id}">
          Advance route
        </button>
        <span class="chip">${route.barangays.join(" � ")}</span>
      </div>
    </article>
  `;
}

function crewCard(crew) {
  return `
    <article class="crew-card insight-card">
      <div class="route-header">
        <div>
          <h3>${crew.lead}</h3>
          <p class="crew-meta">${crew.assignment} � ${crew.members} crew members</p>
        </div>
        <span class="progress-pill ${statusClass(crew.status)}">${crew.status}</span>
      </div>
      <p>${crew.contact}</p>
    </article>
  `;
}

function issueCard(issue) {
  return `
    <article class="issue-card">
      <div class="issue-header">
        <div>
          <h3>${issue.title}</h3>
          <p class="issue-meta">${issue.barangay} � ${issue.type} � reported by ${issue.reporter}</p>
        </div>
        <span class="issue-pill ${issueClass(issue.priority, issue.status)}">${issue.status === "Resolved" ? "Resolved" : `${issue.priority} Priority`}</span>
      </div>
      <p class="issue-detail">${issue.notes}</p>
      <p class="issue-meta">Reported ${formatDateTime(issue.reportedAt)}</p>
      ${
        issue.status !== "Resolved"
          ? `
            <div class="route-actions">
              <button class="secondary-button" type="button" data-action="resolve-issue" data-issue-id="${issue.id}">
                Resolve issue
              </button>
            </div>
          `
          : `<p class="issue-meta">Resolved ${formatDateTime(issue.resolvedAt)}</p>`
      }
    </article>
  `;
}

function barangayCard(barangay) {
  return `
    <article class="barangay-card">
      <div class="barangay-header">
        <div>
          <h3>${barangay.name}</h3>
          <p class="barangay-meta">${barangay.serviceDay} � ${barangay.households.toLocaleString()} households</p>
        </div>
        <span class="progress-pill ${barangay.issuesOpen > 0 ? "issue-medium" : "status-on-schedule"}">
          ${barangay.issuesOpen} open ${barangay.issuesOpen === 1 ? "issue" : "issues"}
        </span>
      </div>
      <div class="barangay-bars">
        <div class="bar-row">
          <div class="bar-labels">
            <span>Collection completion</span>
            <strong>${barangay.completionRate}%</strong>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${barangay.completionRate}%"></div></div>
        </div>
        <div class="bar-row">
          <div class="bar-labels">
            <span>Diversion rate</span>
            <strong>${barangay.diversionRate}%</strong>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${barangay.diversionRate}%"></div></div>
        </div>
      </div>
      <p class="barangay-meta">
        Last pickup ${formatDateTime(barangay.lastPickup)} � Recyclables recovered ${barangay.recyclablesTons} tons
      </p>
    </article>
  `;
}

function renderDashboardView(payload) {
  const { overview, routes, crews, issues, barangays } = payload;
  const averageBarangayCompletion = Math.round(
    barangays.reduce((sum, item) => sum + item.completionRate, 0) / barangays.length
  );
  const highestDiversion = [...barangays].sort((a, b) => b.diversionRate - a.diversionRate)[0];

  return `
    <section class="dashboard-grid">
      <div class="metrics-grid">
        ${metricCard("Collection progress", `${overview.collectionRate}%`, `${overview.completedStops} completed stops`)}
        ${metricCard("Active fleet", `${overview.activeFleet}`, `${overview.delayedRoutes} routes need attention`)}
        ${metricCard("Collected tonnage", `${overview.tonnageCollected}`, "Shift total in metric tons")}
        ${metricCard("Diversion rate", `${overview.diversionRate}%`, `${highestDiversion.name} leads recovery`)}
        ${metricCard("Barangay average", `${averageBarangayCompletion}%`, "Average local service completion")}
      </div>

      <section class="route-board card">
        <div class="panel-heading">
          <p class="eyebrow">Route board</p>
          <h3>Today뭩 collection runs</h3>
        </div>
        <div class="routes-list">
          ${routes.map(routeCard).join("")}
        </div>
      </section>

      <section class="insight-column">
        <div class="insight-card">
          <div class="panel-heading">
            <p class="eyebrow">Priority issues</p>
            <h3>What needs follow-up</h3>
          </div>
          <div class="issues-list">
            ${issues.slice(0, 3).map(issueCard).join("")}
          </div>
        </div>

        <div class="insight-card">
          <div class="panel-heading">
            <p class="eyebrow">Crew availability</p>
            <h3>Field teams</h3>
          </div>
          <div class="crew-list">
            ${crews.map(crewCard).join("")}
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderOperationsView(payload) {
  return `
    <section class="operations-grid">
      <section class="card">
        <div class="panel-heading">
          <p class="eyebrow">Operations control</p>
          <h3>Collection routes</h3>
        </div>
        <div class="routes-list">
          ${payload.routes.map(routeCard).join("")}
        </div>
      </section>

      <aside class="insight-column">
        <div class="insight-card">
          <div class="panel-heading">
            <p class="eyebrow">Supervisor guide</p>
            <h3>Recovery checklist</h3>
          </div>
          <div class="timeline">
            <article class="timeline-item">
              <div class="timeline-time">1</div>
              <strong>Check bottlenecks</strong>
              <p class="timeline-detail">Prioritize blocked lanes, market buildup, and tight access roads.</p>
            </article>
            <article class="timeline-item">
              <div class="timeline-time">2</div>
              <strong>Redispatch standby crew</strong>
              <p class="timeline-detail">Use the Quick Response team to clear high-risk overflow clusters.</p>
            </article>
            <article class="timeline-item">
              <div class="timeline-time">3</div>
              <strong>Rebalance disposal loads</strong>
              <p class="timeline-detail">Unload early if fill level threatens to delay the final sector sweep.</p>
            </article>
          </div>
        </div>

        <div class="insight-card">
          <div class="panel-heading">
            <p class="eyebrow">Field notes</p>
            <h3>Coverage by zone</h3>
          </div>
          <div class="crew-list">
            ${payload.crews.map(crewCard).join("")}
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderBarangaysView(payload) {
  const barangays = payload.barangays.filter((item) => {
    if (appState.barangayFilter === "All") {
      return true;
    }

    if (appState.barangayFilter === "Attention") {
      return item.issuesOpen > 0 || item.completionRate < 70;
    }

    return item.name === appState.barangayFilter;
  });

  return `
    <section class="view-grid">
      <div class="card">
        <div class="route-header">
          <div>
            <p class="eyebrow">Barangay view</p>
            <h3 class="section-title">Local service monitoring</h3>
          </div>
          <div class="filters">
            <button class="chip ${appState.barangayFilter === "All" ? "active" : ""}" data-filter="All" type="button">All barangays</button>
            <button class="chip ${appState.barangayFilter === "Attention" ? "active" : ""}" data-filter="Attention" type="button">Needs attention</button>
            ${payload.barangays
              .slice(0, 4)
              .map(
                (item) => `
                  <button class="chip ${appState.barangayFilter === item.name ? "active" : ""}" data-filter="${item.name}" type="button">
                    ${item.name}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      </div>

      <section class="barangay-grid">
        ${
          barangays.length
            ? barangays.map(barangayCard).join("")
            : `<div class="empty-state">No barangays match the current filter.</div>`
        }
      </section>
    </section>
  `;
}

function renderIssuesView(payload) {
  return `
    <section class="issues-grid">
      <section class="card">
        <div class="panel-heading">
          <p class="eyebrow">Incident desk</p>
          <h3>Open and resolved issues</h3>
        </div>
        <div class="issues-list">
          ${payload.issues.map(issueCard).join("")}
        </div>
      </section>

      <aside class="form-card">
        <div class="panel-heading">
          <p class="eyebrow">Report issue</p>
          <h3>Log a new field incident</h3>
        </div>
        <form id="issueForm">
          <div class="form-field">
            <label for="issueTitle">Issue title</label>
            <input id="issueTitle" name="title" type="text" placeholder="Overflow bin near riverside cluster" required />
          </div>

          <div class="form-field">
            <label for="issueBarangay">Barangay</label>
            <select id="issueBarangay" name="barangay" required>
              <option value="">Select barangay</option>
              ${payload.barangays.map((barangay) => `<option value="${barangay.name}">${barangay.name}</option>`).join("")}
            </select>
          </div>

          <div class="form-field">
            <label for="issueType">Type</label>
            <select id="issueType" name="type" required>
              <option value="">Select issue type</option>
              <option>Overflow Bin</option>
              <option>Missed Pickup</option>
              <option>Vehicle Check</option>
              <option>Segregation Issue</option>
              <option>Illegal Dumping</option>
            </select>
          </div>

          <div class="form-field">
            <label for="issuePriority">Priority</label>
            <select id="issuePriority" name="priority" required>
              <option value="">Select priority</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>

          <div class="form-field">
            <label for="issueReporter">Reporter</label>
            <input id="issueReporter" name="reporter" type="text" placeholder="Field Supervisor" />
          </div>

          <div class="form-field">
            <label for="issueNotes">Notes</label>
            <textarea id="issueNotes" name="notes" rows="4" placeholder="Add access road details, bin location, or route impact."></textarea>
          </div>

          <div class="form-actions">
            <button class="primary-button" type="submit">Log incident</button>
          </div>
        </form>
      </aside>
    </section>
  `;
}

function renderCurrentView() {
  if (!appState.dashboard) {
    return;
  }

  let markup = "";

  if (appState.view === "dashboard") {
    markup = renderDashboardView(appState.dashboard);
  } else if (appState.view === "operations") {
    markup = renderOperationsView(appState.dashboard);
  } else if (appState.view === "barangays") {
    markup = renderBarangaysView(appState.dashboard);
  } else {
    markup = renderIssuesView(appState.dashboard);
  }

  dom.appView.innerHTML = markup;
  syncActiveNav();
}

function syncActiveNav() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === appState.view);
  });
}

async function handleAdvanceRoute(routeId) {
  try {
    await request(`/api/routes/${routeId}/advance`, { method: "PATCH" });
    await loadDashboard();
    showToast("Route progress updated.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleResolveIssue(issueId) {
  try {
    await request(`/api/issues/${issueId}/resolve`, { method: "PATCH" });
    await loadDashboard();
    showToast("Issue marked as resolved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleIssueSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await request("/api/issues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    form.reset();
    await loadDashboard();
    showToast("New incident logged successfully.");
  } catch (error) {
    showToast(error.message);
  }
}

function attachEventListeners() {
  dom.refreshButton.addEventListener("click", () => {
    loadDashboard();
  });

  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-view]");
    if (navButton) {
      appState.view = navButton.dataset.view;
      renderCurrentView();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;

      if (action === "advance-route") {
        handleAdvanceRoute(actionButton.dataset.routeId);
      }

      if (action === "resolve-issue") {
        handleResolveIssue(actionButton.dataset.issueId);
      }

      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      appState.barangayFilter = filterButton.dataset.filter;
      renderCurrentView();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target && event.target.id === "issueForm") {
      handleIssueSubmit(event);
    }
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }
}

attachEventListeners();
registerServiceWorker();
loadDashboard();
