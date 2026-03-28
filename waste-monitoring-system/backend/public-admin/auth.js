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

function bootstrapAuth() {
  const form = document.getElementById("adminLoginForm");
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const rememberMe = document.getElementById("rememberMe");
  const authError = document.getElementById("authError");
  const loginButton = document.getElementById("loginButton");

  if (!form) {
    return;
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Invalid credentials");
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
