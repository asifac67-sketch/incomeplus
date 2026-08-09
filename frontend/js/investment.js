// Investment modal: plan selection (fetched live from /api/plans) -> payment proof
// (txn id + screenshot) -> waiting for approval. Plus: "My Investments" history list.

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("investmentOverlay");
  const closeBtn = document.getElementById("investmentCloseBtn");
  const investNowBtn = document.getElementById("investNowBtn");

  const alertBox = document.getElementById("investmentAlert");

  const stepPlans = document.getElementById("investStepPlans");
  const stepPayment = document.getElementById("investStepPayment");
  const stepSuccess = document.getElementById("investStepSuccess");

  const planGrid = document.getElementById("planGrid");
  const planContinueBtn = document.getElementById("planContinueBtn");
  const planBackBtn = document.getElementById("planBackBtn");

  const selectedAmountText = document.getElementById("selectedAmountText");
  const successAmountText = document.getElementById("successAmountText");

  const copyAccountBtn = document.getElementById("copyAccountBtn");
  const accountNumberText = document.getElementById("accountNumberText");

  const transactionIdInput = document.getElementById("transactionId");
  const screenshotInput = document.getElementById("screenshotInput");
  const uploadZoneEmpty = document.getElementById("uploadZoneEmpty");
  const uploadZonePreview = document.getElementById("uploadZonePreview");
  const uploadPreviewImg = document.getElementById("uploadPreviewImg");
  const uploadFileName = document.getElementById("uploadFileName");
  const uploadRemoveBtn = document.getElementById("uploadRemoveBtn");

  const confirmInvestmentBtn = document.getElementById("confirmInvestmentBtn");
  const investDoneBtn = document.getElementById("investDoneBtn");

  const investmentsHistory = document.getElementById("investmentsHistory");
  const investmentList = document.getElementById("investmentList");

  const profitMonthlyText = document.getElementById("profitMonthlyText");
  const profitDailyText = document.getElementById("profitDailyText");

  let selectedAmount = null;
  let selectedPlan = null;
  let selectedFile = null;

  function formatPkr(amount) {
    return `Rs ${Number(amount).toLocaleString("en-US")}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showAlert(message, type = "error") {
    alertBox.textContent = message;
    alertBox.className = `auth-alert show ${type}`;
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.className = "auth-alert";
  }

  function setLoading(button, loading) {
    button.classList.toggle("is-loading", loading);
    button.disabled = loading;
  }

  function goToStep(step) {
    stepPlans.hidden = step !== "plans";
    stepPayment.hidden = step !== "payment";
    stepSuccess.hidden = step !== "success";
    clearAlert();
  }

  // ---------- Step 1: plan selection (live from the server) ----------
  function renderPlanCards(plans) {
    if (!plans || plans.length === 0) {
      planGrid.innerHTML = `<p class="plan-status-note">No investment plans are available right now — please check back soon.</p>`;
      return;
    }

    planGrid.innerHTML = plans
      .map((plan) => {
        const daily = Math.round(plan.monthly_profit / 30);
        return `
          <button type="button" class="plan-card ${plan.is_featured ? "featured" : ""}" data-amount="${plan.amount}">
            <span class="plan-badge"><i class="fa-solid fa-star"></i> ${escapeHtml(plan.badge_label)}</span>

            <div class="plan-card-icon"><i class="fa-solid fa-sack-dollar"></i></div>

            <div class="plan-price-block">
              <span class="plan-price-label">Package Price</span>
              <span class="plan-amount">${formatPkr(plan.amount)}</span>
            </div>

            <div class="plan-stats-list">
              <div class="plan-stat-row stat-validity">
                <span class="plan-stat-icon"><i class="fa-solid fa-calendar-days"></i></span>
                <span class="plan-stat-label">Validity</span>
                <span class="plan-stat-value">30<small>days</small></span>
              </div>
              <div class="plan-stat-row stat-daily">
                <span class="plan-stat-icon"><i class="fa-solid fa-arrow-trend-up"></i></span>
                <span class="plan-stat-label">Daily Income</span>
                <span class="plan-stat-value">${formatPkr(daily)}<small>/day</small></span>
              </div>
              <div class="plan-stat-row stat-total">
                <span class="plan-stat-icon"><i class="fa-solid fa-coins"></i></span>
                <span class="plan-stat-label">Total Profit</span>
                <span class="plan-stat-value">${formatPkr(plan.monthly_profit)}</span>
              </div>
            </div>

            <span class="plan-note"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(plan.note)}</span>
            <span class="plan-select-indicator"><i class="fa-solid fa-circle-check"></i> Selected</span>
          </button>
        `;
      })
      .join("");

    planGrid.querySelectorAll(".plan-card").forEach((card) => {
      card.addEventListener("click", () => {
        planGrid.querySelectorAll(".plan-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedAmount = Number(card.dataset.amount);
        selectedPlan = plans.find((p) => Number(p.amount) === selectedAmount) || null;
        planContinueBtn.disabled = false;
      });
    });
  }

  async function loadPlans() {
    planGrid.innerHTML = `<p class="plan-status-note">Loading plans&hellip;</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/plans`);
      if (!res.ok) throw new Error("Failed to load plans");
      const plans = await res.json();
      renderPlanCards(plans);
    } catch (err) {
      planGrid.innerHTML = `<p class="plan-status-note">Could not load plans. Please try again.</p>`;
    }
  }

  function resetUpload() {
    selectedFile = null;
    screenshotInput.value = "";
    uploadZoneEmpty.hidden = false;
    uploadZonePreview.hidden = true;
    uploadPreviewImg.src = "";
  }

  function resetModal() {
    selectedAmount = null;
    selectedPlan = null;
    planContinueBtn.disabled = true;
    transactionIdInput.value = "";
    resetUpload();
    goToStep("plans");
    loadPlans();
  }

  function openInvestmentModal() {
    resetModal();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeInvestmentModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  // ---------- Entry point ----------
  investNowBtn?.addEventListener("click", () => {
    const token = window.RT?.getToken?.();
    if (!token) {
      window.RT?.openAuthModal?.("login");
      return;
    }
    openInvestmentModal();
  });

  closeBtn?.addEventListener("click", closeInvestmentModal);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeInvestmentModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeInvestmentModal();
  });

  planContinueBtn?.addEventListener("click", () => {
    if (!selectedAmount || !selectedPlan) return;
    selectedAmountText.textContent = formatPkr(selectedAmount);
    successAmountText.textContent = formatPkr(selectedAmount);

    const dailyProfit = Math.round(selectedPlan.monthly_profit / 30);
    profitMonthlyText.textContent = `${formatPkr(selectedPlan.monthly_profit)}/mo`;
    profitDailyText.textContent = `(≈ ${formatPkr(dailyProfit)}/day)`;

    goToStep("payment");
  });

  planBackBtn?.addEventListener("click", () => goToStep("plans"));

  // ---------- Copy account number ----------
  copyAccountBtn?.addEventListener("click", async () => {
    const icon = copyAccountBtn.querySelector("i");
    try {
      await navigator.clipboard.writeText(accountNumberText.textContent.trim());
      copyAccountBtn.classList.add("copied");
      icon.classList.replace("fa-copy", "fa-check");
      setTimeout(() => {
        copyAccountBtn.classList.remove("copied");
        icon.classList.replace("fa-check", "fa-copy");
      }, 1500);
    } catch (err) {
      showAlert("Could not copy automatically — please copy the number manually.");
    }
  });

  // ---------- Screenshot upload ----------
  screenshotInput?.addEventListener("change", () => {
    const file = screenshotInput.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showAlert("Please upload a PNG, JPG or WEBP image.");
      resetUpload();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showAlert("Screenshot must be smaller than 5MB.");
      resetUpload();
      return;
    }

    clearAlert();
    selectedFile = file;
    uploadFileName.textContent = file.name;
    uploadPreviewImg.src = URL.createObjectURL(file);
    uploadZoneEmpty.hidden = true;
    uploadZonePreview.hidden = false;
  });

  uploadRemoveBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    resetUpload();
  });

  // ---------- Step 2: submit investment request ----------
  confirmInvestmentBtn?.addEventListener("click", async () => {
    if (!selectedAmount) return;
    clearAlert();

    const transactionId = transactionIdInput.value.trim();
    if (!transactionId) {
      showAlert("Please enter the transaction ID from your payment.");
      return;
    }
    if (!selectedFile) {
      showAlert("Please upload a screenshot of your payment.");
      return;
    }

    const token = window.RT?.getToken?.();
    if (!token) {
      closeInvestmentModal();
      window.RT?.openAuthModal?.("login");
      return;
    }

    setLoading(confirmInvestmentBtn, true);

    try {
      const formData = new FormData();
      formData.append("amount", selectedAmount);
      formData.append("transaction_id", transactionId);
      formData.append("screenshot", selectedFile);

      const res = await fetch(`${API_BASE_URL}/api/investments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert(formatApiError(data));
        return;
      }

      goToStep("success");
      refreshInvestmentsList();
    } catch (err) {
      showAlert("Could not reach the server. Is the FastAPI backend running?");
    } finally {
      setLoading(confirmInvestmentBtn, false);
    }
  });

  investDoneBtn?.addEventListener("click", closeInvestmentModal);

  function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => d.msg).join(" ");
    }
    return "Something went wrong. Please try again.";
  }

  // ---------- "My Investments" history list ----------
  const STATUS_META = {
    pending: { label: "Pending", icon: "fa-clock" },
    approved: { label: "Approved", icon: "fa-circle-check" },
    rejected: { label: "Rejected", icon: "fa-circle-xmark" },
  };

  function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function renderInvestments(items) {
    if (!investmentsHistory || !investmentList) return;

    if (!items || items.length === 0) {
      investmentsHistory.hidden = true;
      investmentList.innerHTML = "";
      return;
    }

    investmentList.innerHTML = items
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
              <i class="fa-solid ${meta.icon}"></i>
              ${meta.label}
            </span>
          </div>
        `;
      })
      .join("");

    investmentsHistory.hidden = false;
  }

  async function refreshInvestmentsList() {
    const token = window.RT?.getToken?.();
    if (!token) {
      if (investmentsHistory) investmentsHistory.hidden = true;
      if (investmentList) investmentList.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/investments/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const items = await res.json();
      renderInvestments(items);
    } catch (err) {
      // Silently ignore — wallet section already communicates connectivity issues
    }
  }

  refreshInvestmentsList();

  window.RT = window.RT || {};
  window.RT.refreshInvestments = refreshInvestmentsList;
  window.RT.openInvestmentModal = openInvestmentModal;
});
