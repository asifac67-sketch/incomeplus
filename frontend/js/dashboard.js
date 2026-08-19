// Dashboard: sidebar nav, live earnings ticker, wallet cards, investments/transactions views.
// investment.js and withdrawal.js are loaded after this file and reuse the same
// window.RT.getToken / openAuthModal / refreshUserUI contract as index.html.

// Local dev talks to the local FastAPI server; anything else (Render, etc.)
// talks to the deployed API.
const API_BASE_URL =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : "https://incomeplus-api.onrender.com";

function getToken() {
  return localStorage.getItem("rt_token") || sessionStorage.getItem("rt_token");
}

function clearSession() {
  localStorage.removeItem("rt_token");
  localStorage.removeItem("rt_user");
  sessionStorage.removeItem("rt_token");
  sessionStorage.removeItem("rt_user");
}

// Dashboard requires an existing session — bounce guests straight to the login flow.
if (!getToken()) {
  window.location.href = "index.html";
}

window.RT = window.RT || {};
window.RT.getToken = getToken;
window.RT.openAuthModal = () => {
  window.location.href = "index.html";
};

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("dashSidebar");
  const sidebarBackdrop = document.getElementById("dashSidebarBackdrop");
  const menuToggle = document.getElementById("dashMenuToggle");
  const topbarTitle = document.getElementById("dashTopbarTitle");
  const logoutBtn = document.getElementById("dashLogoutBtn");

  const avatarEl = document.getElementById("dashAvatarInitials");
  const nameEl = document.getElementById("dashUserName");
  const emailEl = document.getElementById("dashUserEmail");

  const earningsTicker = document.getElementById("earningsTicker");
  const earningsRate = document.getElementById("earningsRate");
  const earningsStatusText = document.getElementById("earningsStatusText");
  const payoutHours = document.getElementById("payoutHours");
  const payoutMinutes = document.getElementById("payoutMinutes");
  const payoutSeconds = document.getElementById("payoutSeconds");
  const claimEarningsBtn = document.getElementById("claimEarningsBtn");
  const claimAlert = document.getElementById("claimAlert");

  const claimResultOverlay = document.getElementById("claimResultOverlay");
  const claimResultClose = document.getElementById("claimResultClose");
  const claimResultDoneBtn = document.getElementById("claimResultDoneBtn");
  const claimResultAmount = document.getElementById("claimResultAmount");
  const claimConfettiContainer = document.getElementById("claimConfettiContainer");

  const dashTotalInvested = document.getElementById("dashTotalInvested");
  const dashEarningWallet = document.getElementById("dashEarningWallet");

  const investmentListEl = document.getElementById("dashInvestmentList");
  const investmentsEmptyEl = document.getElementById("dashInvestmentsEmpty");
  const transactionListEl = document.getElementById("dashTransactionList");
  const transactionsEmptyEl = document.getElementById("dashTransactionsEmpty");

  const dashReferralLinkText = document.getElementById("dashReferralLinkText");
  const referralLinkFull = document.getElementById("referralLinkFull");
  const copyReferralLinkBtn = document.getElementById("copyReferralLinkBtn");
  const referralTotalCount = document.getElementById("referralTotalCount");
  const referralTotalEarned = document.getElementById("referralTotalEarned");
  const referralRateDisplay = document.getElementById("referralRateDisplay");
  const referredUsersList = document.getElementById("referredUsersList");
  const referredUsersEmpty = document.getElementById("referredUsersEmpty");
  const referralCommissionsList = document.getElementById("referralCommissionsList");
  const referralCommissionsEmpty = document.getElementById("referralCommissionsEmpty");
  const referralPlanRate = document.getElementById("referralPlanRate");
  const referralPlanRateInline = document.getElementById("referralPlanRateInline");

  const profileForm = document.getElementById("profileForm");
  const profileAlert = document.getElementById("profileAlert");
  const profileEmail = document.getElementById("profileEmail");
  const profileFullName = document.getElementById("profileFullName");
  const profilePhone = document.getElementById("profilePhone");
  const profileCountry = document.getElementById("profileCountry");
  const profileSubmitBtn = document.getElementById("profileSubmitBtn");

  const passwordForm = document.getElementById("passwordForm");
  const securityAlert = document.getElementById("securityAlert");
  const currentPassword = document.getElementById("currentPassword");
  const newPassword = document.getElementById("newPassword");
  const confirmNewPassword = document.getElementById("confirmNewPassword");
  const passwordSubmitBtn = document.getElementById("passwordSubmitBtn");

  const navLinks = document.querySelectorAll("[data-view], [data-action]");
  const viewPanels = document.querySelectorAll(".dash-view");

  let dailyRate = 0;
  let investments = [];
  let withdrawals = [];
  let referralLink = "";
  let claimBaselineAt = null;

  function parseUtc(isoString) {
    return new Date(isoString.endsWith("Z") ? isoString : `${isoString}Z`);
  }

  function formatPkr(amount) {
    return `Rs ${Number(amount).toLocaleString("en-US")}`;
  }

  function formatDate(isoString) {
    return parseUtc(isoString).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function providerLabel(item) {
    if (item.wallet_provider === "jazzcash") return "JazzCash";
    if (item.wallet_provider === "other_bank") return escapeHtml(item.bank_name || "Other Bank");
    return "Easypaisa";
  }

  // ---------- Mobile sidebar ----------
  function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.add("open");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("open");
  }
  menuToggle?.addEventListener("click", openSidebar);
  sidebarBackdrop?.addEventListener("click", closeSidebar);

  document.getElementById("backNavBtn")?.addEventListener("click", () => {
    window.history.back();
  });
  document.getElementById("dashSidebarBackBtn")?.addEventListener("click", () => {
    window.history.back();
  });

  // ---------- Password visibility (Security form) ----------
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

  // ---------- View switching + actions ----------
  const VIEW_TITLES = {
    home: "Dashboard",
    investments: "My Investments",
    transactions: "Transactions",
    referrals: "Referrals",
    "referral-plan": "Referral Plan",
    profile: "Profile",
    security: "Security",
  };

  function showView(view) {
    viewPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.viewPanel === view);
      panel.hidden = panel.dataset.viewPanel !== view;
    });
    document.querySelectorAll(".dash-nav-link[data-view]").forEach((link) => {
      link.classList.toggle("active", link.dataset.view === view);
    });
    if (topbarTitle) topbarTitle.textContent = VIEW_TITLES[view] || "Dashboard";
    closeSidebar();
  }

  navLinks.forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.action === "open-invest") {
        window.RT?.openInvestmentModal?.();
        closeSidebar();
        return;
      }
      if (el.dataset.action === "open-withdraw") {
        window.RT?.openWithdrawalModal?.();
        closeSidebar();
        return;
      }
      if (el.dataset.view) {
        showView(el.dataset.view);
      }
    });
  });

  logoutBtn?.addEventListener("click", () => {
    clearSession();
    window.location.href = "index.html";
  });

  // ---------- Toast (for "coming soon" nav items) ----------
  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById("dashToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "dashToast";
      toast.className = "dash-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // ---------- Data loading ----------
  async function loadUser() {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        clearSession();
        window.location.href = "index.html";
        return null;
      }
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function loadInvestments() {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/investments/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async function loadWithdrawals() {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/withdrawals/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async function loadReferrals() {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/referrals/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function loadClaimStatus() {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/api/investments/earnings/claim-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  function renderReferrals(data) {
    if (!data) return;

    referralLink = new URL(`index.html?ref=${data.referral_code}`, window.location.href).href;

    if (dashReferralLinkText) dashReferralLinkText.textContent = referralLink.replace(/^https?:\/\//, "");
    if (referralLinkFull) referralLinkFull.textContent = referralLink;

    if (referralTotalCount) referralTotalCount.textContent = data.total_referrals;
    if (referralTotalEarned) referralTotalEarned.textContent = formatPkr(data.total_commission_earned);
    if (referralRateDisplay) referralRateDisplay.textContent = `${data.commission_percent}%`;
    if (referralPlanRate) referralPlanRate.textContent = `${data.commission_percent}%`;
    if (referralPlanRateInline) referralPlanRateInline.textContent = `${data.commission_percent}%`;

    if (referredUsersList && referredUsersEmpty) {
      if (data.referred_users.length === 0) {
        referredUsersList.innerHTML = "";
        referredUsersEmpty.hidden = false;
      } else {
        referredUsersEmpty.hidden = true;
        referredUsersList.innerHTML = data.referred_users
          .map(
            (u) => `
              <div class="investment-row">
                <div class="investment-row-meta">
                  <span class="investment-row-txn">${escapeHtml(u.full_name)}</span>
                  <span class="investment-row-date">${escapeHtml(u.email)} &middot; Joined ${formatDate(u.created_at)}</span>
                </div>
              </div>
            `
          )
          .join("");
      }
    }

    if (referralCommissionsList && referralCommissionsEmpty) {
      if (data.commissions.length === 0) {
        referralCommissionsList.innerHTML = "";
        referralCommissionsEmpty.hidden = false;
      } else {
        referralCommissionsEmpty.hidden = true;
        referralCommissionsList.innerHTML = data.commissions
          .map(
            (c) => `
              <div class="investment-row">
                <span class="investment-row-amount">+${formatPkr(c.commission_amount)}</span>
                <div class="investment-row-meta">
                  <span class="investment-row-txn">${c.percent_applied}% of ${formatPkr(c.investment_amount)} investment</span>
                  <span class="investment-row-date">${formatDate(c.created_at)}</span>
                </div>
              </div>
            `
          )
          .join("");
      }
    }
  }

  copyReferralLinkBtn?.addEventListener("click", async () => {
    if (!referralLink) return;
    const icon = copyReferralLinkBtn.querySelector("i");
    const label = copyReferralLinkBtn.querySelector("span");
    try {
      await navigator.clipboard.writeText(referralLink);
      if (icon) icon.classList.replace("fa-copy", "fa-check");
      if (label) label.textContent = "Copied!";
      setTimeout(() => {
        if (icon) icon.classList.replace("fa-check", "fa-copy");
        if (label) label.textContent = "Copy";
      }, 1500);
    } catch (err) {
      showToast("Could not copy — please copy the link manually.");
    }
  });

  // ---------- Profile form ----------
  function showFormAlert(el, message, type = "error") {
    el.textContent = message;
    el.className = `auth-alert show ${type}`;
  }

  profileForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    profileAlert.className = "auth-alert";

    const phone = profilePhone.value.trim();
    if (phone.length < 7) {
      showFormAlert(profileAlert, "Please enter a valid mobile number.");
      return;
    }
    const email = profileEmail.value.trim();
    if (!email) {
      showFormAlert(profileAlert, "Please enter a valid email address.");
      return;
    }

    profileSubmitBtn.classList.add("is-loading");
    profileSubmitBtn.disabled = true;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: profileFullName.value.trim(),
          phone_number: `+92${phone}`,
          country: profileCountry.value,
          email,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showFormAlert(profileAlert, formatApiError(data));
        return;
      }

      renderProfile(data);
      showFormAlert(profileAlert, "Profile updated successfully.", "success");
    } catch (err) {
      showFormAlert(profileAlert, "Could not reach the server. Is the FastAPI backend running?");
    } finally {
      profileSubmitBtn.classList.remove("is-loading");
      profileSubmitBtn.disabled = false;
    }
  });

  // ---------- Security form ----------
  passwordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    securityAlert.className = "auth-alert";

    if (newPassword.value !== confirmNewPassword.value) {
      showFormAlert(securityAlert, "New passwords do not match.");
      return;
    }
    if (newPassword.value.length < 8) {
      showFormAlert(securityAlert, "New password must be at least 8 characters long.");
      return;
    }

    passwordSubmitBtn.classList.add("is-loading");
    passwordSubmitBtn.disabled = true;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: currentPassword.value,
          new_password: newPassword.value,
          confirm_new_password: confirmNewPassword.value,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        showFormAlert(securityAlert, formatApiError(data));
        return;
      }

      passwordForm.reset();
      showFormAlert(securityAlert, "Password updated successfully.", "success");
    } catch (err) {
      showFormAlert(securityAlert, "Could not reach the server. Is the FastAPI backend running?");
    } finally {
      passwordSubmitBtn.classList.remove("is-loading");
      passwordSubmitBtn.disabled = false;
    }
  });

  function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
    return "Something went wrong. Please try again.";
  }

  function renderProfile(user) {
    const initials = user.full_name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials || "U";
    nameEl.textContent = user.full_name;
    emailEl.textContent = user.email;

    if (profileEmail) profileEmail.value = user.email;
    if (profileFullName) profileFullName.value = user.full_name;
    if (profilePhone) profilePhone.value = (user.phone_number || "").replace(/^\+92/, "");
    if (profileCountry) profileCountry.value = user.country || "Pakistan";
  }

  function renderWallets(user) {
    dashTotalInvested.textContent = formatPkr(user.total_investment);
    const pendingWithdrawals = withdrawals
      .filter((w) => w.status === "pending")
      .reduce((sum, w) => sum + Number(w.amount), 0);
    const available = Math.max(0, Number(user.total_earning) - Number(user.withdrawal_amount) - pendingWithdrawals);
    dashEarningWallet.textContent = formatPkr(available);
  }

  function computeDailyRate(items) {
    return items
      .filter((i) => i.status === "approved")
      .reduce((sum, i) => sum + (i.monthly_profit || 0) / 30, 0);
  }

  function renderEarningsStatus(items) {
    const approvedCount = items.filter((i) => i.status === "approved").length;
    const pendingCount = items.filter((i) => i.status === "pending").length;

    if (approvedCount === 0 && pendingCount === 0) {
      earningsStatusText.textContent = "No active investments yet. Choose a plan to start earning.";
    } else if (approvedCount === 0) {
      earningsStatusText.textContent = `${pendingCount} investment${pendingCount > 1 ? "s" : ""} awaiting admin approval.`;
    } else {
      earningsStatusText.textContent = `Earning ${formatPkr(Math.round(dailyRate))}/day from ${approvedCount} active investment${approvedCount > 1 ? "s" : ""}.`;
    }
  }

  const STATUS_META = {
    pending: { label: "Pending", icon: "fa-clock" },
    approved: { label: "Approved", icon: "fa-circle-check" },
    rejected: { label: "Rejected", icon: "fa-circle-xmark" },
    under_investigation: { label: "Under Investigation", icon: "fa-magnifying-glass" },
    refund_in_progress: { label: "Refund in Progress", icon: "fa-rotate" },
  };

  function renderRejectionNote(item) {
    if (item.status !== "rejected" || (!item.rejection_reason && !item.admin_message)) return "";
    return `
      <div class="rejection-note">
        ${item.rejection_reason ? `<span class="rejection-note-reason">Reason: ${escapeHtml(item.rejection_reason)}</span>` : ""}
        ${
          item.admin_message
            ? `<span class="rejection-note-message-label">Message from Admin:</span><span class="rejection-note-message">${escapeHtml(item.admin_message)}</span>`
            : ""
        }
      </div>
    `;
  }

  function renderInvestmentsView(items) {
    if (!items || items.length === 0) {
      investmentListEl.innerHTML = "";
      investmentsEmptyEl.hidden = false;
      return;
    }
    investmentsEmptyEl.hidden = true;

    investmentListEl.innerHTML = items
      .map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        return `
          <div class="investment-row">
            <span class="investment-row-amount">${formatPkr(item.amount)}</span>
            <div class="investment-row-meta">
              <span class="investment-row-txn">Txn: ${escapeHtml(item.transaction_id)}</span>
              <span class="investment-row-date">${formatDate(item.created_at)}</span>
            </div>
            <span class="status-badge status-${item.status}">
              <i class="fa-solid ${meta.icon}"></i> ${meta.label}
            </span>
            ${renderRejectionNote(item)}
          </div>
        `;
      })
      .join("");
  }

  function renderTransactionsView(investmentItems, withdrawalItems) {
    const merged = [
      ...investmentItems.map((i) => ({ ...i, _type: "investment" })),
      ...withdrawalItems.map((w) => ({ ...w, _type: "withdrawal" })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (merged.length === 0) {
      transactionListEl.innerHTML = "";
      transactionsEmptyEl.hidden = false;
      return;
    }
    transactionsEmptyEl.hidden = true;

    transactionListEl.innerHTML = merged
      .map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        const isInvestment = item._type === "investment";
        const detail = isInvestment
          ? `Txn: ${escapeHtml(item.transaction_id)}`
          : `${providerLabel(item)} &middot; ${escapeHtml(item.account_number)}`;

        return `
          <div class="investment-row">
            <span class="transaction-type-badge type-${item._type}">${isInvestment ? "Invest" : "Withdraw"}</span>
            <span class="investment-row-amount">${formatPkr(item.amount)}</span>
            <div class="investment-row-meta">
              <span class="investment-row-txn">${detail}</span>
              <span class="investment-row-date">${formatDate(item.created_at)}</span>
            </div>
            <span class="status-badge status-${item.status}">
              <i class="fa-solid ${meta.icon}"></i> ${meta.label}
            </span>
            ${renderRejectionNote(item)}
          </div>
        `;
      })
      .join("");
  }

  // ---------- Live earnings ticker + payout countdown ----------
  function tick() {
    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const perSecondRate = dailyRate / 86400;
    const unclaimed = claimBaselineAt ? Math.max(0, (now - claimBaselineAt) / 1000) * perSecondRate : 0;

    earningsTicker.textContent = `Rs ${unclaimed.toFixed(6)}`;
    earningsRate.textContent = `+Rs ${perSecondRate.toFixed(6)}/sec`;

    if (claimEarningsBtn) {
      claimEarningsBtn.disabled = !(dailyRate > 0 && unclaimed >= 0.01);
    }

    const msLeft = Math.max(0, tomorrowStart - now);
    const totalSeconds = Math.floor(msLeft / 1000);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    payoutHours.textContent = String(hrs).padStart(2, "0");
    payoutMinutes.textContent = String(mins).padStart(2, "0");
    payoutSeconds.textContent = String(secs).padStart(2, "0");
  }

  // ---------- Refresh everything ----------
  async function refreshDashboardData() {
    const [user, investmentItems, withdrawalItems, referralData, claimStatus] = await Promise.all([
      loadUser(),
      loadInvestments(),
      loadWithdrawals(),
      loadReferrals(),
      loadClaimStatus(),
    ]);
    if (!user) return;

    investments = investmentItems;
    withdrawals = withdrawalItems;
    dailyRate = computeDailyRate(investments);
    claimBaselineAt = claimStatus ? parseUtc(claimStatus.last_claimed_at) : null;

    renderProfile(user);
    renderWallets(user);
    renderEarningsStatus(investments);
    renderInvestmentsView(investments);
    renderTransactionsView(investments, withdrawals);
    renderReferrals(referralData);
    tick();
  }

  window.RT.refreshUserUI = refreshDashboardData;

  // Refresh dashboard data once an investment/withdrawal is successfully submitted.
  document.getElementById("investDoneBtn")?.addEventListener("click", refreshDashboardData);
  document.getElementById("withdrawDoneBtn")?.addEventListener("click", refreshDashboardData);

  // ---------- Claim success popup: confetti + a soft chime ----------
  const CLAIM_CONFETTI_COLORS = ["#6bf0a0", "#00d4ff", "#ffd166", "#6c5ce7"];

  function launchClaimConfetti() {
    if (!claimConfettiContainer) return;
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.background = CLAIM_CONFETTI_COLORS[Math.floor(Math.random() * CLAIM_CONFETTI_COLORS.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 200}px`);
      piece.style.setProperty("--spin", `${360 * (2 + Math.random() * 3)}deg`);

      const duration = 2.2 + Math.random() * 1.2;
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;

      claimConfettiContainer.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 1) * 1000);
    }
  }

  function playClaimSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [783.99, 1046.5]; // short two-note chime, softer than the spin-win sound

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;

        const startTime = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.14, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });

      setTimeout(() => ctx.close(), 800);
    } catch (err) {
      // Audio blocked/unavailable — the popup still shows.
    }
  }

  function openClaimResultModal(amount) {
    if (!claimResultOverlay) return;
    claimResultAmount.textContent = formatPkr(amount.toFixed(2));
    claimResultOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
    launchClaimConfetti();
    playClaimSound();
  }

  function closeClaimResultModal() {
    claimResultOverlay?.classList.remove("open");
    document.body.style.overflow = "";
  }

  claimResultClose?.addEventListener("click", closeClaimResultModal);
  claimResultDoneBtn?.addEventListener("click", closeClaimResultModal);
  claimResultOverlay?.addEventListener("click", (e) => {
    if (e.target === claimResultOverlay) closeClaimResultModal();
  });

  // ---------- Claim accrued earnings into the real wallet ----------
  claimEarningsBtn?.addEventListener("click", async () => {
    claimAlert.className = "auth-alert";
    claimAlert.textContent = "";
    claimEarningsBtn.classList.add("is-loading");
    claimEarningsBtn.disabled = true;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/investments/earnings/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        claimAlert.textContent = data.detail || "Could not claim right now.";
        claimAlert.className = "auth-alert show error";
        return;
      }

      openClaimResultModal(data.claimed_amount);
      // Re-pull full user/withdrawal state instead of hand-computing the wallet
      // balance here, so it's subtracted the same complete way renderWallets()
      // does (withdrawal_amount + pending withdrawals), not just total_earning.
      await refreshDashboardData();
    } catch (err) {
      claimAlert.textContent = "Could not reach the server. Is the FastAPI backend running?";
      claimAlert.className = "auth-alert show error";
    } finally {
      claimEarningsBtn.classList.remove("is-loading");
    }
  });

  refreshDashboardData();
  setInterval(tick, 250);
});
