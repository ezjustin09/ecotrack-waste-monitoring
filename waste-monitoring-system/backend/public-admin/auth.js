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

  if (!normalized || normalized.startsWith("<")) {
    return "";
  }

  return normalized.slice(0, 180);
}

async function parseResponsePayload(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};
  const responseText = contentType.includes("application/json")
    ? ""
    : await response.text().catch(() => "");

  if (!response.ok) {
    const fallbackMessage = `Request failed (${response.status || "unknown error"}).`;
    throw new Error(
      payload.error ||
        payload.message ||
        extractErrorMessageFromText(responseText) ||
        fallbackMessage
    );
  }

  return payload;
}

function buildVerificationMessage(payload = {}) {
  const destination = String(payload.destination || "").trim();
  const expiresAt = String(payload.expiresAt || "").trim();
  let message = destination
    ? `Verification code sent to ${destination}.`
    : "Verification code sent.";

  if (expiresAt) {
    const expiry = new Date(expiresAt);

    if (!Number.isNaN(expiry.getTime())) {
      message += ` Expires at ${expiry.toLocaleTimeString()}.`;
    }
  }

  if (payload.developmentCode) {
    message += ` Development code: ${payload.developmentCode}.`;
  }

  return message;
}

function bootstrapAuth() {
  const form = document.getElementById("adminLoginForm");
  const credentialsStep = document.getElementById("credentialsStep");
  const verificationStep = document.getElementById("verificationStep");
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const verificationCodeInput = document.getElementById("adminVerificationCode");
  const togglePasswordButton = document.getElementById("toggleAdminPassword");
  const rememberMe = document.getElementById("rememberMe");
  const authInfo = document.getElementById("authInfo");
  const authError = document.getElementById("authError");
  const loginButton = document.getElementById("loginButton");
  const resendButton = document.getElementById("resendVerificationCode");
  const restartButton = document.getElementById("restartAdminLogin");

  if (!form) {
    return;
  }

  let authPhase = "credentials";
  let pendingChallengeToken = "";
  let rememberChoice = false;

  function clearMessages() {
    authError.textContent = "";
    if (authInfo) {
      authInfo.textContent = "";
    }
  }

  function setControlsDisabled(disabled) {
    loginButton.disabled = disabled;

    if (resendButton) {
      resendButton.disabled = disabled;
    }

    if (restartButton) {
      restartButton.disabled = disabled;
    }
  }

  function resetToCredentialsPhase() {
    authPhase = "credentials";
    pendingChallengeToken = "";
    rememberChoice = false;
    clearMessages();
    credentialsStep?.classList.remove("hidden");
    verificationStep?.classList.add("hidden");
    usernameInput.disabled = false;
    passwordInput.disabled = false;

    if (rememberMe) {
      rememberMe.disabled = false;
    }

    if (verificationCodeInput) {
      verificationCodeInput.value = "";
    }

    if (togglePasswordButton) {
      togglePasswordButton.disabled = false;
    }

    loginButton.textContent = "Sign In";
    setControlsDisabled(false);
  }

  function enterVerificationPhase(payload) {
    authPhase = "verification";
    pendingChallengeToken = String(payload.challengeToken || "").trim();
    rememberChoice = rememberMe.checked;
    clearMessages();
    credentialsStep?.classList.add("hidden");
    verificationStep?.classList.remove("hidden");
    usernameInput.disabled = true;
    passwordInput.disabled = true;

    if (rememberMe) {
      rememberMe.disabled = true;
    }

    if (togglePasswordButton) {
      togglePasswordButton.disabled = true;
    }

    if (authInfo) {
      authInfo.textContent = buildVerificationMessage(payload);
    }

    if (verificationCodeInput) {
      verificationCodeInput.value = "";
      verificationCodeInput.focus();
    }

    loginButton.textContent = "Verify Code";
    setControlsDisabled(false);
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

  if (verificationCodeInput) {
    verificationCodeInput.addEventListener("input", () => {
      verificationCodeInput.value = String(verificationCodeInput.value || "")
        .replace(/\D/g, "")
        .slice(0, 6);
    });
  }

  if (getStoredToken()) {
    window.location.replace("/admin/dashboard.html");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages();

    if (authPhase === "credentials") {
      const username = String(usernameInput.value || "").trim();
      const password = String(passwordInput.value || "");

      if (!username || !password) {
        authError.textContent = "Please enter your username and password.";
        return;
      }

      setControlsDisabled(true);
      loginButton.textContent = "Sending Code...";

      try {
        const payload = await parseResponsePayload(
          await fetch("/admin/auth/login", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
          })
        );

        if (!payload.requiresVerification || !payload.challengeToken) {
          throw new Error("Unexpected sign-in response from server. Please refresh and try again.");
        }

        enterVerificationPhase(payload);
      } catch (error) {
        authError.textContent = error.message || "Unable to sign in.";
        setControlsDisabled(false);
        loginButton.textContent = "Sign In";
      }

      return;
    }

    const code = String(verificationCodeInput?.value || "").replace(/\D/g, "");

    if (!pendingChallengeToken) {
      resetToCredentialsPhase();
      authError.textContent = "Verification expired. Sign in again.";
      return;
    }

    if (code.length !== 6) {
      authError.textContent = "Enter the 6-digit verification code.";
      return;
    }

    setControlsDisabled(true);
    loginButton.textContent = "Verifying...";

    try {
      const payload = await parseResponsePayload(
        await fetch("/admin/auth/verify-login", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeToken: pendingChallengeToken,
            code,
          }),
        })
      );

      if (!payload.token) {
        throw new Error("Unexpected verification response from server. Please try again.");
      }

      storeToken(payload.token, rememberChoice);
      window.location.replace("/admin/dashboard.html");
    } catch (error) {
      authError.textContent = error.message || "Unable to verify code.";
      setControlsDisabled(false);
      loginButton.textContent = "Verify Code";
    }
  });

  resendButton?.addEventListener("click", async () => {
    clearMessages();

    if (!pendingChallengeToken) {
      resetToCredentialsPhase();
      authError.textContent = "Verification expired. Sign in again.";
      return;
    }

    setControlsDisabled(true);

    try {
      const payload = await parseResponsePayload(
        await fetch("/admin/auth/resend-code", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeToken: pendingChallengeToken,
          }),
        })
      );

      pendingChallengeToken = String(payload.challengeToken || "").trim();

      if (authInfo) {
        authInfo.textContent = buildVerificationMessage(payload);
      }

      if (verificationCodeInput) {
        verificationCodeInput.value = "";
        verificationCodeInput.focus();
      }
    } catch (error) {
      authError.textContent = error.message || "Unable to resend verification code.";
    } finally {
      setControlsDisabled(false);
    }
  });

  restartButton?.addEventListener("click", () => {
    resetToCredentialsPhase();
    passwordInput.focus();
  });
}

bootstrapAuth();
