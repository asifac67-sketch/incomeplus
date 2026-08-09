// Auth modal: tab switching, role toggle, password visibility, validation, API calls

// Local dev talks to the local FastAPI server; anything else (Render, etc.)
// talks to the deployed API.
const API_BASE_URL =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : "https://incomeplus-api.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("authOverlay");
  const closeBtn = document.getElementById("authCloseBtn");
  const openLoginBtn = document.getElementById("openLoginBtn");
  const openSignupBtn = document.getElementById("openSignupBtn");
  const heroGetStartedBtn = document.getElementById("heroGetStartedBtn");
  const heroLoginBtn = document.getElementById("heroLoginBtn");

  const tabs = document.querySelectorAll(".auth-tab");
  const forms = document.querySelectorAll(".auth-form");
  const switchButtons = document.querySelectorAll("[data-switch]");

  const authAlert = document.getElementById("authAlert");
  const modalTitle = document.getElementById("authModalTitle");
  const modalSubtitle = document.getElementById("authModalSubtitle");

  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  const walletLoginBtn = document.getElementById("walletLoginBtn");
  const walletLocked = document.getElementById("walletLocked");
  const walletGrid = document.getElementById("walletGrid");
  const totalEarningAmount = document.getElementById("totalEarningAmount");
  const totalInvestmentAmount = document.getElementById("totalInvestmentAmount");
  const withdrawalAmount = document.getElementById("withdrawalAmount");

  const authButtons = document.getElementById("authButtons");
  const userChip = document.getElementById("userChip");
  const userChipName = document.getElementById("userChipName");
  const logoutBtn = document.getElementById("logoutBtn");

  const referredByNote = document.getElementById("referredByNote");
  const referralCodeFromUrl = new URLSearchParams(window.location.search).get("ref");

  // Public site is user-only — admin sign-in lives on its own separate,
  // unlinked page (admin.html) so regular visitors never see an admin option.
  const currentRole = "user";

  // ---------- Modal open/close ----------
  function openModal(tab = "login") {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setActiveTab(tab);
    clearAlert();
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  openLoginBtn?.addEventListener("click", () => openModal("login"));
  heroLoginBtn?.addEventListener("click", () => openModal("login"));
  openSignupBtn?.addEventListener("click", () => openModal("signup"));
  heroGetStartedBtn?.addEventListener("click", () => openModal("signup"));
  walletLoginBtn?.addEventListener("click", () => openModal("login"));

  closeBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });

  // ---------- Tabs (Login / Sign Up) ----------
  function setActiveTab(tabName) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
    forms.forEach((f) => f.classList.toggle("active", f.id === `${tabName}Form`));

    if (tabName === "login") {
      modalTitle.textContent = "Welcome Back";
      modalSubtitle.textContent = "Log in to continue to IncomePlus.";
    } else {
      modalTitle.textContent = "Create Your Account";
      modalSubtitle.textContent = "New here? Join IncomePlus in seconds.";
    }
    clearAlert();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  switchButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.switch));
  });

  // ---------- Password visibility ----------
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetInput = document.getElementById(btn.dataset.target);
      const icon = btn.querySelector("i");
      const isPassword = targetInput.type === "password";
      targetInput.type = isPassword ? "text" : "password";
      icon.classList.toggle("fa-eye");
      icon.classList.toggle("fa-eye-slash");
    });
  });

  // ---------- Alert helpers ----------
  function showAlert(message, type = "error") {
    authAlert.textContent = message;
    authAlert.className = `auth-alert show ${type}`;
  }

  function clearAlert() {
    authAlert.textContent = "";
    authAlert.className = "auth-alert";
  }

  function setLoading(button, loading) {
    button.classList.toggle("is-loading", loading);
    button.disabled = loading;
  }

  // ---------- Session storage helpers ----------
  function saveSession(token, user, rememberMe) {
    const store = rememberMe ? localStorage : sessionStorage;
    store.setItem("rt_token", token);
    store.setItem("rt_user", JSON.stringify(user));
  }

  function getToken() {
    return localStorage.getItem("rt_token") || sessionStorage.getItem("rt_token");
  }

  function clearSession() {
    localStorage.removeItem("rt_token");
    localStorage.removeItem("rt_user");
    sessionStorage.removeItem("rt_token");
    sessionStorage.removeItem("rt_user");
  }

  // ---------- Header + wallet UI state ----------
  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
  }

  function showLoggedInUI(user) {
    if (authButtons) authButtons.hidden = true;
    if (userChip) userChip.hidden = false;
    if (userChipName) userChipName.textContent = user.full_name;

    if (walletLocked) walletLocked.hidden = true;
    if (walletGrid) walletGrid.hidden = false;
    if (totalEarningAmount) totalEarningAmount.textContent = formatCurrency(user.total_earning);
    if (totalInvestmentAmount) totalInvestmentAmount.textContent = formatCurrency(user.total_investment);
    if (withdrawalAmount) withdrawalAmount.textContent = formatCurrency(user.withdrawal_amount);

    window.RT?.refreshInvestments?.();
    window.RT?.refreshBonusState?.();
    window.RT?.refreshWithdrawals?.();
  }

  function showLoggedOutUI() {
    if (authButtons) authButtons.hidden = false;
    if (userChip) userChip.hidden = true;
    if (walletLocked) walletLocked.hidden = false;
    if (walletGrid) walletGrid.hidden = true;

    window.RT?.refreshInvestments?.();
    window.RT?.refreshBonusState?.();
    window.RT?.refreshWithdrawals?.();
  }

  function goToDashboard(user) {
    window.location.href = user.role === "admin" ? "admin.html" : "dashboard.html";
  }

  async function refreshUserUI() {
    const token = getToken();
    if (!token) {
      showLoggedOutUI();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        clearSession();
        showLoggedOutUI();
        return;
      }

      const user = await res.json();

      // index.html is the guest landing page — a signed-in visitor belongs on
      // their dashboard (or the admin panel), so send them there right away.
      // Exception: links that want to keep a logged-in user here (e.g. the
      // dashboard's "Daily Bonus" link) pass ?stay=1 to opt out.
      const stayOnPage = new URLSearchParams(window.location.search).get("stay") === "1";
      if (stayOnPage) {
        showLoggedInUI(user);
      } else {
        goToDashboard(user);
      }
    } catch (err) {
      showLoggedOutUI();
    }
  }

  logoutBtn?.addEventListener("click", () => {
    clearSession();
    showLoggedOutUI();
  });

  refreshUserUI();

  // ---------- Referral link landing ----------
  if (referralCodeFromUrl) {
    if (referredByNote) referredByNote.hidden = false;
    openModal("signup");
  }

  // ---------- Signup ----------
  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const fullName = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("signupConfirmPassword").value;
    const phoneNumber = document.getElementById("signupPhone").value.trim();
    const country = document.getElementById("signupCountry").value;

    if (password !== confirmPassword) {
      showAlert("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      showAlert("Password must be at least 8 characters long.");
      return;
    }
    if (phoneNumber.length < 7) {
      showAlert("Please enter a valid mobile number.");
      return;
    }

    const submitBtn = document.getElementById("signupSubmitBtn");
    setLoading(submitBtn, true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          confirm_password: confirmPassword,
          phone_number: `+92${phoneNumber}`,
          country,
          role: currentRole,
          admin_code: null,
          referral_code: referralCodeFromUrl || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert(formatApiError(data));
        return;
      }

      showAlert("Account created successfully! You can now log in.", "success");
      signupForm.reset();
      setTimeout(() => setActiveTab("login"), 1200);
    } catch (err) {
      showAlert("Could not reach the server. Is the FastAPI backend running?");
    } finally {
      setLoading(submitBtn, false);
    }
  });

  // ---------- Login ----------
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const rememberMe = document.getElementById("rememberMe").checked;

    const submitBtn = document.getElementById("loginSubmitBtn");
    setLoading(submitBtn, true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          role: currentRole,
          remember_me: rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert(formatApiError(data));
        return;
      }

      saveSession(data.access_token, data.user, rememberMe);
      showAlert(`Welcome back, ${data.user.full_name}! Taking you to your dashboard…`, "success");
      setTimeout(() => goToDashboard(data.user), 700);
    } catch (err) {
      showAlert("Could not reach the server. Is the FastAPI backend running?");
    } finally {
      setLoading(submitBtn, false);
    }
  });

  function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => d.msg).join(" ");
    }
    return "Something went wrong. Please try again.";
  }

  // Exposed for investment.js to reuse the same modal + session state
  window.RT = window.RT || {};
  window.RT.openAuthModal = openModal;
  window.RT.getToken = getToken;
  window.RT.refreshUserUI = refreshUserUI;
});
