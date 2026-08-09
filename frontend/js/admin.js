// Local dev talks to the local FastAPI server; anything else (Render, etc.)
// talks to the deployed API.
const API_BASE_URL =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : "https://incomeplus-api.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const adminGate = document.getElementById("adminGate");
  const adminDashboard = document.getElementById("adminDashboard");

  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminLoginAlert = document.getElementById("adminLoginAlert");
  const adminLoginBtn = document.getElementById("adminLoginBtn");

  const adminChipName = document.getElementById("adminChipName");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");

  const typeTabs = document.querySelectorAll(".type-tab");

  const statPending = document.getElementById("statPending");
  const statApproved = document.getElementById("statApproved");
  const statRejected = document.getElementById("statRejected");
  const statTotal = document.getElementById("statTotal");

  const filterTabs = document.querySelectorAll(".filter-tab");
  const refreshBtn = document.getElementById("refreshBtn");
  const adminAlert = document.getElementById("adminAlert");
  const requestGrid = document.getElementById("requestGrid");
  const emptyState = document.getElementById("emptyState");
  const emptyStateText = emptyState?.querySelector("p");

  const lightboxOverlay = document.getElementById("lightboxOverlay");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  const requestsPanel = document.getElementById("requestsPanel");
  const plansPanel = document.getElementById("plansPanel");
  const plansGrid = document.getElementById("plansGrid");
  const plansEmptyState = document.getElementById("plansEmptyState");
  const plansAlert = document.getElementById("plansAlert");
  const addPlanBtn = document.getElementById("addPlanBtn");

  const planModalOverlay = document.getElementById("planModalOverlay");
  const planModalClose = document.getElementById("planModalClose");
  const planModalTitle = document.getElementById("planModalTitle");
  const planForm = document.getElementById("planForm");
  const planFormAlert = document.getElementById("planFormAlert");
  const planAmount = document.getElementById("planAmount");
  const planMonthlyProfit = document.getElementById("planMonthlyProfit");
  const planBadgeLabel = document.getElementById("planBadgeLabel");
  const planNote = document.getElementById("planNote");
  const planSortOrder = document.getElementById("planSortOrder");
  const planFeatured = document.getElementById("planFeatured");
  const planActiveWrap = document.getElementById("planActiveWrap");
  const planActive = document.getElementById("planActive");
  const planSubmitBtn = document.getElementById("planSubmitBtn");

  const referralsPanel = document.getElementById("referralsPanel");
  const referralSettingsAlert = document.getElementById("referralSettingsAlert");
  const referralSettingsForm = document.getElementById("referralSettingsForm");
  const referralCommissionPercent = document.getElementById("referralCommissionPercent");
  const referralSettingsSubmitBtn = document.getElementById("referralSettingsSubmitBtn");

  const spinPanel = document.getElementById("spinPanel");
  const spinAlert = document.getElementById("spinAlert");
  const spinUserSearch = document.getElementById("spinUserSearch");
  const spinUserList = document.getElementById("spinUserList");
  const spinEmptyState = document.getElementById("spinEmptyState");
  const setAllSpinBtn = document.getElementById("setAllSpinBtn");

  const forceSpinModalOverlay = document.getElementById("forceSpinModalOverlay");
  const forceSpinModalClose = document.getElementById("forceSpinModalClose");
  const forceSpinModalSubtitle = document.getElementById("forceSpinModalSubtitle");
  const forceSpinAlert = document.getElementById("forceSpinAlert");
  const spinAmountGrid = document.getElementById("spinAmountGrid");
  const forceSpinSaveBtn = document.getElementById("forceSpinSaveBtn");

  const usersPanel = document.getElementById("usersPanel");
  const usersSearch = document.getElementById("usersSearch");
  const usersList = document.getElementById("usersList");
  const usersEmptyState = document.getElementById("usersEmptyState");

  const userDetailOverlay = document.getElementById("userDetailOverlay");
  const userDetailClose = document.getElementById("userDetailClose");
  const userDetailAvatar = document.getElementById("userDetailAvatar");
  const userDetailName = document.getElementById("userDetailName");
  const userDetailEmail = document.getElementById("userDetailEmail");
  const userDetailJoined = document.getElementById("userDetailJoined");
  const userDetailEarning = document.getElementById("userDetailEarning");
  const userDetailInvestment = document.getElementById("userDetailInvestment");
  const userDetailWithdrawn = document.getElementById("userDetailWithdrawn");
  const userDetailReferrals = document.getElementById("userDetailReferrals");
  const historyTabs = document.querySelectorAll("[data-history-tab]");
  const userDetailInvestments = document.getElementById("userDetailInvestments");
  const userDetailWithdrawals = document.getElementById("userDetailWithdrawals");
  const userDetailSpins = document.getElementById("userDetailSpins");
  const userDetailEmptyNote = document.getElementById("userDetailEmptyNote");

  let currentType = "investments"; // "investments" | "withdrawals" | "plans" | "referrals" | "spin"
  let activeFilter = "";
  let allRequests = [];
  let allPlans = [];
  let editingPlanId = null;

  const STATUS_META = {
    pending: { label: "Pending", icon: "fa-clock" },
    approved: { label: "Approved", icon: "fa-circle-check" },
    rejected: { label: "Rejected", icon: "fa-circle-xmark" },
  };

  function getToken() {
    return localStorage.getItem("rt_admin_token") || sessionStorage.getItem("rt_admin_token");
  }

  function saveToken(token) {
    localStorage.setItem("rt_admin_token", token);
  }

  function clearToken() {
    localStorage.removeItem("rt_admin_token");
    sessionStorage.removeItem("rt_admin_token");
  }

  function showGate() {
    adminGate.hidden = false;
    adminDashboard.hidden = true;
  }

  function showDashboard(user) {
    adminGate.hidden = true;
    adminDashboard.hidden = false;
    adminChipName.textContent = user.full_name;
    loadRequests();
  }

  function formatPkr(amount) {
    return `Rs ${Number(amount).toLocaleString("en-US")}`;
  }

  function formatDate(isoString) {
    return new Date(isoString).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showAdminAlert(message, type = "error") {
    adminAlert.textContent = message;
    adminAlert.className = `auth-alert show ${type}`;
  }

  function clearAdminAlert() {
    adminAlert.textContent = "";
    adminAlert.className = "auth-alert";
  }

  // ---------- Login ----------
  adminLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    adminLoginAlert.className = "auth-alert";

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    adminLoginBtn.classList.add("is-loading");
    adminLoginBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: "admin", remember_me: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        adminLoginAlert.textContent = formatApiError(data);
        adminLoginAlert.className = "auth-alert show error";
        return;
      }

      saveToken(data.access_token);
      showDashboard(data.user);
    } catch (err) {
      adminLoginAlert.textContent = "Could not reach the server. Is the FastAPI backend running?";
      adminLoginAlert.className = "auth-alert show error";
    } finally {
      adminLoginBtn.classList.remove("is-loading");
      adminLoginBtn.disabled = false;
    }
  });

  adminLogoutBtn?.addEventListener("click", () => {
    clearToken();
    showGate();
  });

  document.getElementById("backNavBtn")?.addEventListener("click", () => {
    window.history.back();
  });

  function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
    return "Something went wrong. Please try again.";
  }

  // ---------- Session check on load ----------
  async function checkSession() {
    const token = getToken();
    if (!token) {
      showGate();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        clearToken();
        showGate();
        return;
      }
      const user = await res.json();
      if (user.role !== "admin") {
        clearToken();
        showGate();
        return;
      }
      showDashboard(user);
    } catch (err) {
      showGate();
    }
  }

  // ---------- Type tabs (Investments / Withdrawals / Plans / Referrals) ----------
  function hideAllPanels() {
    requestsPanel.hidden = true;
    plansPanel.hidden = true;
    referralsPanel.hidden = true;
    spinPanel.hidden = true;
    usersPanel.hidden = true;
  }

  typeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.type === currentType) return;
      typeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentType = tab.dataset.type;
      hideAllPanels();

      if (currentType === "plans") {
        plansPanel.hidden = false;
        loadPlans();
        return;
      }

      if (currentType === "referrals") {
        referralsPanel.hidden = false;
        loadReferralSettings();
        return;
      }

      if (currentType === "spin") {
        spinPanel.hidden = false;
        loadSpinUsers();
        return;
      }

      if (currentType === "users") {
        usersPanel.hidden = false;
        loadAllUsers();
        return;
      }

      requestsPanel.hidden = false;

      activeFilter = "";
      filterTabs.forEach((t) => t.classList.toggle("active", t.dataset.status === ""));

      if (emptyStateText) {
        emptyStateText.textContent =
          currentType === "investments" ? "No investment requests found." : "No withdrawal requests found.";
      }

      loadRequests();
    });
  });

  // ---------- Load + render requests ----------
  async function loadRequests() {
    clearAdminAlert();
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/${currentType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          showGate();
          return;
        }
        showAdminAlert(`Could not load ${currentType}.`);
        return;
      }
      allRequests = await res.json();
      updateStats();
      renderRequests();
    } catch (err) {
      showAdminAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  function updateStats() {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    allRequests.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] += 1;
    });
    statPending.textContent = counts.pending;
    statApproved.textContent = counts.approved;
    statRejected.textContent = counts.rejected;
    statTotal.textContent = allRequests.length;
  }

  function renderRequests() {
    const items = activeFilter ? allRequests.filter((r) => r.status === activeFilter) : allRequests;

    if (items.length === 0) {
      requestGrid.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    requestGrid.innerHTML = items.map(renderCard).join("");

    requestGrid.querySelectorAll(".screenshot-thumb").forEach((btn) => {
      btn.addEventListener("click", () => openLightbox(btn.dataset.src));
    });
    requestGrid.querySelectorAll(".btn-approve").forEach((btn) => {
      btn.addEventListener("click", () => reviewRequest(btn.dataset.id, "approve"));
    });
    requestGrid.querySelectorAll(".btn-reject").forEach((btn) => {
      btn.addEventListener("click", () => reviewRequest(btn.dataset.id, "reject"));
    });
  }

  function renderCard(item) {
    const meta = STATUS_META[item.status] || STATUS_META.pending;

    const actions =
      item.status === "pending"
        ? `
          <div class="request-card-actions">
            <button type="button" class="btn btn-outline btn-reject" data-id="${item.id}">
              <i class="fa-solid fa-xmark"></i> <span>Reject</span>
            </button>
            <button type="button" class="btn btn-primary btn-approve" data-id="${item.id}">
              <i class="fa-solid fa-check"></i> <span>Approve</span>
            </button>
          </div>
        `
        : `<p class="request-reviewed-note">Reviewed on ${item.reviewed_at ? formatDate(item.reviewed_at) : "—"}</p>`;

    const body =
      currentType === "investments"
        ? `
          <div class="request-card-body">
            <div class="request-detail"><span>Amount</span><strong>${formatPkr(item.amount)}</strong></div>
            <div class="request-detail"><span>Transaction ID</span><strong>${escapeHtml(item.transaction_id)}</strong></div>
            <div class="request-detail"><span>Submitted</span><strong>${formatDate(item.created_at)}</strong></div>
          </div>
          <button type="button" class="screenshot-thumb" data-src="${API_BASE_URL}/uploads/investments/${item.screenshot_path}">
            <img src="${API_BASE_URL}/uploads/investments/${item.screenshot_path}" alt="Payment screenshot" loading="lazy" />
            <span><i class="fa-solid fa-expand"></i> View Screenshot</span>
          </button>
        `
        : `
          <div class="request-card-body">
            <div class="request-detail"><span>Amount</span><strong>${formatPkr(item.amount)}</strong></div>
            <div class="request-detail"><span>Provider</span><strong>${item.wallet_provider === "jazzcash" ? "JazzCash" : "Easypaisa"}</strong></div>
            <div class="request-detail"><span>Account Number</span><strong>${escapeHtml(item.account_number)}</strong></div>
            <div class="request-detail"><span>Submitted</span><strong>${formatDate(item.created_at)}</strong></div>
          </div>
        `;

    return `
      <div class="request-card" data-request-id="${item.id}">
        <div class="request-card-top">
          <div class="request-user">
            <span class="request-user-avatar"><i class="fa-solid fa-user"></i></span>
            <div>
              <span class="request-user-name">${escapeHtml(item.user.full_name)}</span>
              <span class="request-user-email">${escapeHtml(item.user.email)}</span>
            </div>
          </div>
          <span class="status-badge status-${item.status}">
            <i class="fa-solid ${meta.icon}"></i> ${meta.label}
          </span>
        </div>

        ${body}

        ${actions}
      </div>
    `;
  }

  async function reviewRequest(id, action) {
    const token = getToken();
    const card = requestGrid.querySelector(`[data-request-id="${id}"]`);
    const buttons = card?.querySelectorAll("button") || [];
    buttons.forEach((b) => (b.disabled = true));

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/${currentType}/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        showAdminAlert(formatApiError(data));
        buttons.forEach((b) => (b.disabled = false));
        return;
      }

      await loadRequests();
    } catch (err) {
      showAdminAlert("Could not reach the server. Is the FastAPI backend running?");
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  // ---------- Filters + refresh ----------
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.dataset.status;
      renderRequests();
    });
  });

  refreshBtn?.addEventListener("click", loadRequests);

  // ---------- Plans management ----------
  function showPlansAlert(message, type = "error") {
    plansAlert.textContent = message;
    plansAlert.className = `auth-alert show ${type}`;
  }
  function clearPlansAlert() {
    plansAlert.textContent = "";
    plansAlert.className = "auth-alert";
  }

  async function loadPlans() {
    clearPlansAlert();
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          showGate();
          return;
        }
        showPlansAlert("Could not load investment plans.");
        return;
      }
      allPlans = await res.json();
      renderPlans();
    } catch (err) {
      showPlansAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  function renderPlans() {
    if (allPlans.length === 0) {
      plansGrid.innerHTML = "";
      plansEmptyState.hidden = false;
      return;
    }
    plansEmptyState.hidden = true;

    plansGrid.innerHTML = allPlans.map(renderPlanCard).join("");

    plansGrid.querySelectorAll(".btn-edit-plan").forEach((btn) => {
      btn.addEventListener("click", () => openPlanModal(btn.dataset.id));
    });
    plansGrid.querySelectorAll(".btn-toggle-active").forEach((btn) => {
      btn.addEventListener("click", () => togglePlanActive(btn.dataset.id));
    });
    plansGrid.querySelectorAll(".btn-delete-plan").forEach((btn) => {
      btn.addEventListener("click", () => deletePlan(btn.dataset.id));
    });
  }

  function renderPlanCard(plan) {
    const daily = Math.round(plan.monthly_profit / 30);
    return `
      <div class="admin-plan-card ${plan.is_active ? "" : "inactive"}" data-plan-id="${plan.id}">
        <div class="admin-plan-card-top">
          <span class="admin-plan-badge ${plan.is_featured ? "featured" : ""}">
            ${plan.is_featured ? '<i class="fa-solid fa-star"></i>' : ""} ${escapeHtml(plan.badge_label)}
          </span>
          <span class="admin-plan-status ${plan.is_active ? "active" : "inactive"}">${plan.is_active ? "Active" : "Inactive"}</span>
        </div>
        <span class="admin-plan-amount">${formatPkr(plan.amount)}</span>
        <span class="admin-plan-profit">
          <i class="fa-solid fa-arrow-trend-up"></i> ${formatPkr(plan.monthly_profit)}/mo
          <em>&asymp; ${formatPkr(daily)}/day</em>
        </span>
        <p class="admin-plan-note">${escapeHtml(plan.note)}</p>
        <div class="admin-plan-actions">
          <button type="button" class="btn btn-outline btn-toggle-active" data-id="${plan.id}" title="${plan.is_active ? "Deactivate" : "Activate"}">
            <i class="fa-solid ${plan.is_active ? "fa-eye-slash" : "fa-eye"}"></i>
          </button>
          <button type="button" class="btn btn-outline btn-edit-plan" data-id="${plan.id}">
            <i class="fa-solid fa-pen"></i> <span>Edit</span>
          </button>
          <button type="button" class="btn btn-outline btn-delete-plan" data-id="${plan.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  function openPlanModal(planId = null) {
    editingPlanId = planId;
    planForm.reset();
    planFormAlert.className = "auth-alert";

    if (planId) {
      const plan = allPlans.find((p) => p.id === planId);
      if (!plan) return;
      planModalTitle.textContent = "Edit Investment Plan";
      planAmount.value = plan.amount;
      planMonthlyProfit.value = plan.monthly_profit;
      planBadgeLabel.value = plan.badge_label;
      planNote.value = plan.note;
      planSortOrder.value = plan.sort_order;
      planFeatured.checked = plan.is_featured;
      planActive.checked = plan.is_active;
      planActiveWrap.hidden = false;
    } else {
      planModalTitle.textContent = "Add Investment Plan";
      planActiveWrap.hidden = true;
    }

    planModalOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closePlanModal() {
    planModalOverlay.classList.remove("open");
    document.body.style.overflow = "";
    editingPlanId = null;
  }

  addPlanBtn?.addEventListener("click", () => openPlanModal());
  planModalClose?.addEventListener("click", closePlanModal);
  planModalOverlay?.addEventListener("click", (e) => {
    if (e.target === planModalOverlay) closePlanModal();
  });

  planForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    planFormAlert.className = "auth-alert";

    const payload = {
      amount: Number(planAmount.value),
      monthly_profit: Number(planMonthlyProfit.value),
      badge_label: planBadgeLabel.value.trim(),
      note: planNote.value.trim(),
      sort_order: Number(planSortOrder.value) || 0,
      is_featured: planFeatured.checked,
    };
    if (editingPlanId) payload.is_active = planActive.checked;

    planSubmitBtn.classList.add("is-loading");
    planSubmitBtn.disabled = true;

    try {
      const token = getToken();
      const url = editingPlanId ? `${API_BASE_URL}/api/admin/plans/${editingPlanId}` : `${API_BASE_URL}/api/admin/plans`;
      const method = editingPlanId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        planFormAlert.textContent = formatApiError(data);
        planFormAlert.className = "auth-alert show error";
        return;
      }

      closePlanModal();
      loadPlans();
    } catch (err) {
      planFormAlert.textContent = "Could not reach the server. Is the FastAPI backend running?";
      planFormAlert.className = "auth-alert show error";
    } finally {
      planSubmitBtn.classList.remove("is-loading");
      planSubmitBtn.disabled = false;
    }
  });

  async function togglePlanActive(planId) {
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !plan.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        showPlansAlert(formatApiError(data));
        return;
      }
      loadPlans();
    } catch (err) {
      showPlansAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  async function deletePlan(planId) {
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;
    if (!confirm(`Delete the Rs ${Number(plan.amount).toLocaleString("en-US")} plan? This cannot be undone.`)) return;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/plans/${planId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        showPlansAlert(formatApiError(data));
        return;
      }
      loadPlans();
    } catch (err) {
      showPlansAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  // ---------- Referral Program settings ----------
  function showReferralAlert(message, type = "error") {
    referralSettingsAlert.textContent = message;
    referralSettingsAlert.className = `auth-alert show ${type}`;
  }

  async function loadReferralSettings() {
    referralSettingsAlert.className = "auth-alert";
    const token = getToken();

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/referral-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          showGate();
          return;
        }
        showReferralAlert("Could not load referral settings.");
        return;
      }
      const data = await res.json();
      referralCommissionPercent.value = data.commission_percent;
    } catch (err) {
      showReferralAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  referralSettingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    referralSettingsAlert.className = "auth-alert";

    referralSettingsSubmitBtn.classList.add("is-loading");
    referralSettingsSubmitBtn.disabled = true;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/referral-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commission_percent: Number(referralCommissionPercent.value) }),
      });
      const data = await res.json();

      if (!res.ok) {
        showReferralAlert(formatApiError(data));
        return;
      }

      referralCommissionPercent.value = data.commission_percent;
      showReferralAlert("Referral commission rate updated.", "success");
    } catch (err) {
      showReferralAlert("Could not reach the server. Is the FastAPI backend running?");
    } finally {
      referralSettingsSubmitBtn.classList.remove("is-loading");
      referralSettingsSubmitBtn.disabled = false;
    }
  });

  // ---------- Spin Control ----------
  const WHEEL_PRIZE_OPTIONS = [0, 100, 500, 25000, 50000];
  let spinSearchDebounce = null;
  let activeForceSpinUser = null;
  let selectedForceAmount = null;

  function showSpinAlert(message, type = "error") {
    spinAlert.textContent = message;
    spinAlert.className = `auth-alert show ${type}`;
  }
  function clearSpinAlert() {
    spinAlert.textContent = "";
    spinAlert.className = "auth-alert";
  }

  function initials(name) {
    return (name || "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function renderSpinUsers(users) {
    if (!users || users.length === 0) {
      spinUserList.innerHTML = "";
      spinEmptyState.hidden = false;
      return;
    }
    spinEmptyState.hidden = true;

    spinUserList.innerHTML = users
      .map((user) => {
        const forcedBadge =
          user.forced_amount !== null && user.forced_amount !== undefined
            ? `<span class="spin-user-forced"><i class="fa-solid fa-lock"></i> Next: ${formatPkr(user.forced_amount)}</span>`
            : "";
        const lastSpinText =
          user.last_spin_amount !== null && user.last_spin_amount !== undefined
            ? `Last spin: ${formatPkr(user.last_spin_amount)}`
            : "No spins yet";

        return `
          <div class="spin-user-card" data-user-id="${user.id}" data-user-name="${escapeHtml(user.full_name)}">
            <span class="spin-user-avatar">${escapeHtml(initials(user.full_name))}</span>
            <div class="spin-user-info">
              <span class="spin-user-name">${escapeHtml(user.full_name)}</span>
              <span class="spin-user-email">${escapeHtml(user.email)}</span>
            </div>
            <div class="spin-user-meta">
              ${forcedBadge}
              <span class="spin-user-last">${lastSpinText}</span>
            </div>
            <div class="spin-user-actions">
              <button type="button" class="btn btn-primary btn-sm spin-set-btn">
                <i class="fa-solid fa-dharmachakra"></i> Set
              </button>
              ${
                forcedBadge
                  ? `<button type="button" class="btn btn-outline btn-sm spin-clear-btn"><i class="fa-solid fa-xmark"></i> Clear</button>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    spinUserList.querySelectorAll(".spin-set-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".spin-user-card");
        openForceSpinModal(card.dataset.userId, card.dataset.userName);
      });
    });
    spinUserList.querySelectorAll(".spin-clear-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".spin-user-card");
        clearForcedSpin(card.dataset.userId);
      });
    });
  }

  async function loadSpinUsers() {
    clearSpinAlert();
    const token = getToken();
    if (!token) return;

    const search = spinUserSearch.value.trim();
    const url = new URL(`${API_BASE_URL}/api/admin/spin-control/users`);
    if (search) url.searchParams.set("search", search);

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          showGate();
          return;
        }
        showSpinAlert("Could not load users.");
        return;
      }
      const users = await res.json();
      renderSpinUsers(users);
    } catch (err) {
      showSpinAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  spinUserSearch?.addEventListener("input", () => {
    clearTimeout(spinSearchDebounce);
    spinSearchDebounce = setTimeout(loadSpinUsers, 350);
  });

  async function clearForcedSpin(userId) {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/spin-control/users/${userId}/force`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        showSpinAlert("Could not clear the forced spin.");
        return;
      }
      loadSpinUsers();
    } catch (err) {
      showSpinAlert("Could not reach the server. Is the FastAPI backend running?");
    }
  }

  // ---------- Force Spin modal ----------
  function renderSpinAmountGrid() {
    spinAmountGrid.innerHTML = WHEEL_PRIZE_OPTIONS.map(
      (amount) => `<button type="button" class="spin-amount-option" data-amount="${amount}">${formatPkr(amount)}</button>`
    ).join("");

    spinAmountGrid.querySelectorAll(".spin-amount-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        spinAmountGrid.querySelectorAll(".spin-amount-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedForceAmount = Number(btn.dataset.amount);
      });
    });
  }

  function openForceSpinModal(userId, userName) {
    activeForceSpinUser = userId;
    selectedForceAmount = null;
    forceSpinModalSubtitle.textContent =
      userId === "ALL"
        ? "Choose the amount every user's next spin will land on."
        : `Choose the amount ${userName}'s next spin will land on.`;
    forceSpinAlert.className = "auth-alert";
    forceSpinAlert.textContent = "";
    renderSpinAmountGrid();
    forceSpinModalOverlay.classList.add("open");
  }

  setAllSpinBtn?.addEventListener("click", () => openForceSpinModal("ALL", "every user"));

  function closeForceSpinModal() {
    forceSpinModalOverlay.classList.remove("open");
    activeForceSpinUser = null;
  }

  forceSpinModalClose?.addEventListener("click", closeForceSpinModal);
  forceSpinModalOverlay?.addEventListener("click", (e) => {
    if (e.target === forceSpinModalOverlay) closeForceSpinModal();
  });

  forceSpinSaveBtn?.addEventListener("click", async () => {
    if (selectedForceAmount === null) {
      forceSpinAlert.textContent = "Please choose an amount.";
      forceSpinAlert.className = "auth-alert show error";
      return;
    }

    forceSpinSaveBtn.classList.add("is-loading");
    forceSpinSaveBtn.disabled = true;

    try {
      const token = getToken();
      const isBulk = activeForceSpinUser === "ALL";
      const url = isBulk
        ? `${API_BASE_URL}/api/admin/spin-control/all-force`
        : `${API_BASE_URL}/api/admin/spin-control/users/${activeForceSpinUser}/force`;

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: selectedForceAmount }),
      });
      const data = await res.json();

      if (!res.ok) {
        forceSpinAlert.textContent = formatApiError(data);
        forceSpinAlert.className = "auth-alert show error";
        return;
      }

      closeForceSpinModal();
      if (isBulk) {
        showSpinAlert(`Set Rs ${selectedForceAmount} for ${data.updated_count} user(s).`, "success");
      }
      loadSpinUsers();
    } catch (err) {
      forceSpinAlert.textContent = "Could not reach the server. Is the FastAPI backend running?";
      forceSpinAlert.className = "auth-alert show error";
    } finally {
      forceSpinSaveBtn.classList.remove("is-loading");
      forceSpinSaveBtn.disabled = false;
    }
  });

  // ---------- All Users (full history) ----------
  let usersSearchDebounce = null;

  function renderUsersList(users) {
    if (!users || users.length === 0) {
      usersList.innerHTML = "";
      usersEmptyState.hidden = false;
      return;
    }
    usersEmptyState.hidden = true;

    usersList.innerHTML = users
      .map(
        (user) => `
          <div class="spin-user-card user-list-card" data-user-id="${user.id}">
            <span class="spin-user-avatar">${escapeHtml(initials(user.full_name))}</span>
            <div class="spin-user-info">
              <span class="spin-user-name">${escapeHtml(user.full_name)}</span>
              <span class="spin-user-email">${escapeHtml(user.email)}</span>
            </div>
            <div class="spin-user-meta">
              <span class="spin-user-forced">${user.role === "admin" ? "Admin" : "User"}</span>
              <span class="spin-user-last">Earning: ${formatPkr(user.total_earning)}</span>
            </div>
          </div>
        `
      )
      .join("");

    usersList.querySelectorAll(".user-list-card").forEach((card) => {
      card.addEventListener("click", () => openUserDetailModal(card.dataset.userId));
    });
  }

  async function loadAllUsers() {
    const token = getToken();
    if (!token) return;

    const search = usersSearch.value.trim();
    const url = new URL(`${API_BASE_URL}/api/admin/users`);
    if (search) url.searchParams.set("search", search);

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          showGate();
        }
        return;
      }
      renderUsersList(await res.json());
    } catch (err) {
      usersList.innerHTML = "";
      usersEmptyState.hidden = false;
    }
  }

  usersSearch?.addEventListener("input", () => {
    clearTimeout(usersSearchDebounce);
    usersSearchDebounce = setTimeout(loadAllUsers, 350);
  });

  // ---------- User Detail modal ----------
  function renderInvestmentHistory(container, items, type) {
    if (!items || items.length === 0) {
      container.innerHTML = "";
      return false;
    }
    container.innerHTML = items
      .map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        const sub =
          type === "investment"
            ? `Txn: ${escapeHtml(item.transaction_id)}`
            : type === "withdrawal"
            ? `${item.wallet_provider === "jazzcash" ? "JazzCash" : "Easypaisa"} &middot; ${escapeHtml(item.account_number)}`
            : `Day ${item.day_number} spin`;
        const date = formatDate(item.created_at || item.spun_at);
        const badge =
          type === "spin"
            ? ""
            : `<span class="status-badge status-${item.status}"><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>`;
        return `
          <div class="investment-row">
            <span class="investment-row-amount">${formatPkr(item.amount)}</span>
            <div class="investment-row-meta">
              <span class="investment-row-txn">${sub}</span>
              <span class="investment-row-date">${date}</span>
            </div>
            ${badge}
          </div>
        `;
      })
      .join("");
    return true;
  }

  function setHistoryTab(tabName) {
    historyTabs.forEach((t) => t.classList.toggle("active", t.dataset.historyTab === tabName));
    userDetailInvestments.hidden = tabName !== "investments";
    userDetailWithdrawals.hidden = tabName !== "withdrawals";
    userDetailSpins.hidden = tabName !== "spins";

    const activeContainer =
      tabName === "investments" ? userDetailInvestments : tabName === "withdrawals" ? userDetailWithdrawals : userDetailSpins;
    userDetailEmptyNote.hidden = activeContainer.innerHTML.trim() !== "";
  }

  historyTabs.forEach((tab) => {
    tab.addEventListener("click", () => setHistoryTab(tab.dataset.historyTab));
  });

  async function openUserDetailModal(userId) {
    userDetailOverlay.classList.add("open");
    userDetailName.textContent = "Loading…";
    userDetailEmail.textContent = "";
    userDetailInvestments.innerHTML = "";
    userDetailWithdrawals.innerHTML = "";
    userDetailSpins.innerHTML = "";

    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        userDetailName.textContent = "Could not load user.";
        return;
      }
      const data = await res.json();
      const user = data.user;

      userDetailAvatar.textContent = initials(user.full_name);
      userDetailName.textContent = user.full_name;
      userDetailEmail.textContent = user.email;
      userDetailJoined.textContent = `Joined ${formatDate(user.created_at)}`;
      userDetailEarning.textContent = formatPkr(user.total_earning);
      userDetailInvestment.textContent = formatPkr(user.total_investment);
      userDetailWithdrawn.textContent = formatPkr(user.withdrawal_amount);
      userDetailReferrals.textContent = data.referred_count;

      renderInvestmentHistory(userDetailInvestments, data.investments, "investment");
      renderInvestmentHistory(userDetailWithdrawals, data.withdrawals, "withdrawal");
      renderInvestmentHistory(userDetailSpins, data.spins, "spin");

      setHistoryTab("investments");
    } catch (err) {
      userDetailName.textContent = "Could not reach the server.";
    }
  }

  function closeUserDetailModal() {
    userDetailOverlay.classList.remove("open");
  }
  userDetailClose?.addEventListener("click", closeUserDetailModal);
  userDetailOverlay?.addEventListener("click", (e) => {
    if (e.target === userDetailOverlay) closeUserDetailModal();
  });

  // ---------- Lightbox ----------
  function openLightbox(src) {
    lightboxImg.src = src;
    lightboxOverlay.classList.add("open");
  }
  function closeLightbox() {
    lightboxOverlay.classList.remove("open");
    lightboxImg.src = "";
  }
  lightboxClose?.addEventListener("click", closeLightbox);
  lightboxOverlay?.addEventListener("click", (e) => {
    if (e.target === lightboxOverlay) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightboxOverlay.classList.contains("open")) closeLightbox();
  });

  checkSession();
});
