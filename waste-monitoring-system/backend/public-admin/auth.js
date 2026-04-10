const STORAGE_KEY = "wm_admin_token";
const SESSION_KEY = "wm_admin_token_session";

function getStoredToken() {
  return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(SESSION_KEY) || "";
}

function storeToken(token, remember) {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);

  if (!token) {
    return;
  }

  if (remember) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    sessionStorage.setItem(SESSION_KEY, token);
  }
}

function extractErrorMessageFromText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("<")) {
    return "";
  }

  return normalized.slice(0, 180);
}

function bootstrapAuth() {
  const form = document.getElementById("adminLoginForm");
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const togglePasswordButton = document.getElementById("toggleAdminPassword");
  const rememberMe = document.getElementById("rememberMe");
  const authError = document.getElementById("authError");
  const loginButton = document.getElementById("loginButton");

  if (!form) {
    return;
  }

  if (togglePasswordButton && passwordInput) {
    togglePasswordButton.addEventListener("click", () => {
      const isVisible = passwordInput.type === "text";
      passwordInput.type = isVisible ? "password" : "text";
      togglePasswordButton.setAttribute("aria-pressed", String(!isVisible));
      togglePasswordButton.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
      togglePasswordButton.classList.toggle("active", !isVisible);
    });
  }

  if (getStoredToken()) {
    window.location.replace("/admin/dashboard.html");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.textContent = "";

    const username = String(usernameInput.value || "").trim();
    const password = String(passwordInput.value || "");

    if (!username || !password) {
      authError.textContent = "Please enter your username and password.";
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    try {
      const response = await fetch("/admin/auth/login", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};
      const responseText = contentType.includes("application/json")
        ? ""
        : await response.text().catch(() => "");

      if (!response.ok || !payload.token) {
        const fallbackMessage = response.ok
          ? "Unexpected sign-in response from server. Please refresh and try again."
          : `Sign in failed (${response.status || "unknown error"}).`;
        throw new Error(
          payload.error ||
            payload.message ||
            extractErrorMessageFromText(responseText) ||
            fallbackMessage
        );
      }

      storeToken(payload.token, rememberMe.checked);
      window.location.replace("/admin/dashboard.html");
    } catch (error) {
      authError.textContent = error.message || "Unable to sign in.";
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Sign In";
    }
  });
}

bootstrapAuth();

