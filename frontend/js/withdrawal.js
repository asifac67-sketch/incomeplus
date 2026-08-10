// Withdrawal modal: amount + wallet provider (Easypaisa/JazzCash) + account number -> pending approval
// Plus: "My Withdrawals" status history list on the dashboard

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("withdrawalOverlay");
  const closeBtn = document.getElementById("withdrawalCloseBtn");
  const withdrawCardBtn = document.getElementById("withdrawCardBtn");

  const alertBox = document.getElementById("withdrawalAlert");

  const stepForm = document.getElementById("withdrawStepForm");
  const stepSuccess = document.getElementById("withdrawStepSuccess");

  const availableText = document.getElementById("withdrawAvailableText");
  const amountInput = document.getElementById("withdrawAmount");
  const providerButtons = document.querySelectorAll("#walletProviderToggle .role-btn");
  const accountNumberInput = document.getElementById("withdrawAccountNumber");
  const submitBtn = document.getElementById("withdrawSubmitBtn");
  const successAmountText = document.getElementById("withdrawSuccessAmount");
  const doneBtn = document.getElementById("withdrawDoneBtn");

  const withdrawalsHistory = document.getElementById("withdrawalsHistory");
  const withdrawalList = document.getElementById("withdrawalList");

  const investRequiredOverlay = document.getElementById("investRequiredOverlay");
  const investRequiredClose = document.getElementById("investRequiredClose");
  const investRequiredLaterBtn = document.getElementById("investRequiredLaterBtn");
  const investRequiredCta = document.getElementById("investRequiredCta");
  const investRequiredAmountText = document.getElementById("investRequiredAmountText");

  if (!overlay) return;

  let selectedProvider = "easypaisa";
  let availableBalance = 0;

  function formatPkr(amount) {
    return `Rs ${Number(amount).toLocaleString("en-US")}`;
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
    stepForm.hidden = step !== "form";
    stepSuccess.hidden = step !== "success";
    clearAlert();
  }

  function resetModal() {
    amountInput.value = "";
    accountNumberInput.value = "";
    selectedProvider = "easypaisa";
    providerButtons.forEach((b) => b.classList.toggle("active", b.dataset.provider === "easypaisa"));
    goToStep("form");
  }

  async function openWithdrawalModal() {
    const token = window.RT?.getToken?.();
    if (!token) {
      window.RT?.openAuthModal?.("login");
      return;
    }

    try {
      const gateRes = await fetch(`${API_BASE_URL}/api/withdrawals/eligibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (gateRes.ok) {
        const gateData = await gateRes.json();
        if (gateData.gated) {
          openInvestRequiredModal(gateData.required_investment);
          return;
        }
      }
    } catch (err) {
      // If the check itself fails, fall through to the form — the
      // submit-time gate on the backend still protects against this case.
    }

    resetModal();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const user = await res.json();
        availableBalance = Math.max(0, Number(user.total_earning) - Number(user.withdrawal_amount));
        availableText.textContent = formatPkr(availableBalance);
      }
    } catch (err) {
      availableText.textContent = "Rs 0";
    }
  }

  function closeWithdrawalModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  // ---------- Investment-required gate (big bonus winners) ----------
  function openInvestRequiredModal(requiredAmount) {
    if (investRequiredAmountText && requiredAmount) {
      investRequiredAmountText.textContent = formatPkr(requiredAmount);
    }
    investRequiredOverlay?.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeInvestRequiredModal() {
    investRequiredOverlay?.classList.remove("open");
    document.body.style.overflow = "";
  }

  investRequiredClose?.addEventListener("click", closeInvestRequiredModal);
  investRequiredLaterBtn?.addEventListener("click", closeInvestRequiredModal);
  investRequiredOverlay?.addEventListener("click", (e) => {
    if (e.target === investRequiredOverlay) closeInvestRequiredModal();
  });
  investRequiredCta?.addEventListener("click", () => {
    closeInvestRequiredModal();
    window.RT?.openInvestmentModal?.();
  });

  withdrawCardBtn?.addEventListener("click", openWithdrawalModal);
  closeBtn?.addEventListener("click", closeWithdrawalModal);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeWithdrawalModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeWithdrawalModal();
  });

  providerButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      providerButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedProvider = btn.dataset.provider;
    });
  });

  submitBtn?.addEventListener("click", async () => {
    clearAlert();
    const token = window.RT?.getToken?.();
    if (!token) {
      closeWithdrawalModal();
      window.RT?.openAuthModal?.("login");
      return;
    }

    const amount = Number(amountInput.value);
    const accountNumber = accountNumberInput.value.trim();

    if (!amount || amount <= 0) {
      showAlert("Please enter a valid amount.");
      return;
    }
    if (amount > availableBalance) {
      showAlert(`You can withdraw up to ${formatPkr(availableBalance)}.`);
      return;
    }
    if (accountNumber.length < 7) {
      showAlert("Please enter a valid account number.");
      return;
    }

    setLoading(submitBtn, true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/withdrawals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          wallet_provider: selectedProvider,
          account_number: accountNumber,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.detail && data.detail.code === "BONUS_INVESTMENT_REQUIRED") {
          closeWithdrawalModal();
          openInvestRequiredModal(data.detail.required_investment);
          return;
        }
        showAlert(formatApiError(data));
        return;
      }

      successAmountText.textContent = formatPkr(amount);
      goToStep("success");
      refreshWithdrawalsList();
    } catch (err) {
      showAlert("Could not reach the server. Is the FastAPI backend running?");
    } finally {
      setLoading(submitBtn, false);
    }
  });

  doneBtn?.addEventListener("click", closeWithdrawalModal);

  function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
    return "Something went wrong. Please try again.";
  }

  // ---------- "My Withdrawals" history list ----------
  const STATUS_META = {
    pending: { label: "Pending", icon: "fa-clock" },
    approved: { label: "Approved", icon: "fa-circle-check" },
    rejected: { label: "Rejected", icon: "fa-circle-xmark" },
  };

  function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderWithdrawals(items) {
    if (!withdrawalsHistory || !withdrawalList) return;

    if (!items || items.length === 0) {
      withdrawalsHistory.hidden = true;
      withdrawalList.innerHTML = "";
      return;
    }

    withdrawalList.innerHTML = items
      .map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        const providerLabel = item.wallet_provider === "jazzcash" ? "JazzCash" : "Easypaisa";
        return `
          <div class="investment-row">
            <span class="investment-row-amount">${formatPkr(item.amount)}</span>
            <div class="investment-row-meta">
              <span class="investment-row-txn">${providerLabel} &middot; ${escapeHtml(item.account_number)}</span>
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

    withdrawalsHistory.hidden = false;
  }

  async function refreshWithdrawalsList() {
    const token = window.RT?.getToken?.();
    if (!token) {
      if (withdrawalsHistory) withdrawalsHistory.hidden = true;
      if (withdrawalList) withdrawalList.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/withdrawals/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const items = await res.json();
      renderWithdrawals(items);
    } catch (err) {
      // Silently ignore
    }
  }

  refreshWithdrawalsList();

  window.RT = window.RT || {};
  window.RT.refreshWithdrawals = refreshWithdrawalsList;
  window.RT.openWithdrawalModal = openWithdrawalModal;
});
