// Daily Bonus Wheel: renders the wheel, checks eligibility, spins, and reveals the result.
// Prize amounts are admin-editable — fetched live from /api/bonus/segments
// rather than hardcoded, so the wheel always matches what's configured.

document.addEventListener("DOMContentLoaded", async () => {
  let WHEEL_SEGMENTS = [0, 500, 0, 6000, 0, 15000, 0, 500000]; // fallback until loaded
  let SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

  const wheel = document.getElementById("bonusWheel");
  const wheelLabels = document.getElementById("wheelLabels");
  const spinBtn = document.getElementById("spinBtn");
  const bonusSignupBtn = document.getElementById("bonusSignupBtn");
  const statusMessage = document.getElementById("bonusStatusMessage");

  const resultOverlay = document.getElementById("bonusResultOverlay");
  const resultClose = document.getElementById("bonusResultClose");
  const resultDoneBtn = document.getElementById("bonusResultDoneBtn");
  const resultIcon = document.getElementById("bonusResultIcon");
  const resultTitle = document.getElementById("bonusResultTitle");
  const resultLead = document.getElementById("bonusResultLead");
  const resultAmount = document.getElementById("bonusResultAmount");
  const resultNote = document.getElementById("bonusResultNote");
  const resultWithdrawBtn = document.getElementById("bonusResultWithdrawBtn");
  const resultWithdrawText = document.getElementById("bonusResultWithdrawText");

  if (!wheel) return;

  let cumulativeRotation = 0;

  // ---------- Build wheel face: labels + rim bulbs ----------
  // Each label/bulb uses a zero-width "anchor" div sized to the desired radius
  // (a % of the wheel's own height works for width/height, unlike translate %,
  // which is relative to the element's own tiny box) and rotated from its top —
  // so its bottom end swings out to the right point at the right angle.
  function renderWheelLabels(segments) {
    wheelLabels.innerHTML = "";
    segments.forEach((amount, i) => {
      const angle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      // The anchor's un-rotated resting position points straight down (180deg),
      // not up — so its rotation must be offset by -180 to land the label at
      // the intended angle (matching the color segment spinTo() targets).
      const anchorRotate = angle - 180;

      const anchor = document.createElement("div");
      anchor.className = "wheel-label-anchor";
      anchor.style.transform = `rotate(${anchorRotate}deg)`;

      const label = document.createElement("span");
      label.className = "wheel-label";
      label.textContent =
        amount >= 100000 ? `Rs ${amount / 100000}L` : amount >= 1000 ? `Rs ${amount / 1000}K` : `Rs ${amount}`;
      label.style.transform = `translate(-50%, 50%) rotate(${-anchorRotate}deg)`;

      anchor.appendChild(label);
      wheelLabels.appendChild(anchor);
    });
  }

  renderWheelLabels(WHEEL_SEGMENTS);

  async function loadWheelSegments() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bonus/segments`);
      if (!res.ok) return;
      const segments = await res.json();
      if (!segments || segments.length === 0) return;

      segments.sort((a, b) => a.position - b.position);
      WHEEL_SEGMENTS = segments.map((s) => s.amount);
      SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;
      renderWheelLabels(WHEEL_SEGMENTS);
    } catch (err) {
      // Keep the fallback segments already rendered.
    }
  }

  loadWheelSegments();

  const bulbsContainer = document.createElement("div");
  bulbsContainer.className = "wheel-bulbs";
  const BULB_COUNT = 16;
  for (let i = 0; i < BULB_COUNT; i++) {
    const angle = (360 / BULB_COUNT) * i;

    const anchor = document.createElement("div");
    anchor.className = "wheel-bulb-anchor";
    anchor.style.transform = `rotate(${angle}deg)`;

    const bulb = document.createElement("span");
    bulb.className = "wheel-bulb";
    bulb.style.animationDelay = `${(i % 4) * 0.3}s`;

    anchor.appendChild(bulb);
    bulbsContainer.appendChild(anchor);
  }
  wheel.parentElement.appendChild(bulbsContainer);

  // ---------- Auth-aware eligibility ----------
  function showMessage(text, type = "warning") {
    statusMessage.textContent = text;
    statusMessage.className = `bonus-status-message ${type === "success" ? "success" : ""}`;
    statusMessage.hidden = false;
  }

  function hideMessage() {
    statusMessage.hidden = true;
  }

  async function refreshBonusState() {
    const token = window.RT?.getToken?.();

    if (!token) {
      if (bonusSignupBtn) bonusSignupBtn.hidden = false;
      spinBtn.disabled = true;
      hideMessage();
      return;
    }

    if (bonusSignupBtn) bonusSignupBtn.hidden = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/bonus/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        spinBtn.disabled = true;
        return;
      }
      const data = await res.json();

      if (data.eligible) {
        spinBtn.disabled = false;
        showMessage(`Day ${data.next_day_number} bonus spin is ready — good luck!`, "success");
      } else {
        spinBtn.disabled = true;
        showMessage(data.reason || "The daily bonus isn't available right now.");
      }
    } catch (err) {
      spinBtn.disabled = true;
    }
  }

  bonusSignupBtn?.addEventListener("click", () => window.RT?.openAuthModal?.("signup"));

  document.getElementById("spinNowBtn")?.addEventListener("click", () => {
    const token = window.RT?.getToken?.();
    if (!token) {
      window.RT?.openAuthModal?.("signup");
      return;
    }
    document.getElementById("daily-bonus")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!spinBtn.disabled) {
      spinBtn.click();
    }
  });

  // ---------- Spin ----------
  spinBtn?.addEventListener("click", async () => {
    const token = window.RT?.getToken?.();
    if (!token) {
      window.RT?.openAuthModal?.("login");
      return;
    }

    spinBtn.disabled = true;
    spinBtn.classList.add("is-loading");
    hideMessage();

    try {
      const res = await fetch(`${API_BASE_URL}/api/bonus/spin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        showMessage(data.detail || "Could not spin the wheel right now.");
        spinBtn.classList.remove("is-loading");
        return;
      }

      spinTo(data.segment_index, () => {
        const won = data.amount > 0;
        resultTitle.textContent = won ? "Congratulations!" : "So Close!";
        resultLead.textContent = won ? "You won" : "This spin landed on";
        resultAmount.textContent = `Rs ${data.amount}`;
        resultNote.textContent = won
          ? "Added to your Total Earning balance."
          : "No bonus this time — better luck on your next spin!";
        resultIcon.classList.toggle("no-win", !won);

        if (won) {
          resultWithdrawText.textContent = `Withdraw Rs ${data.amount}`;
          resultWithdrawBtn.hidden = false;
        } else {
          resultWithdrawBtn.hidden = true;
        }

        openResultModal();
        if (won) {
          launchConfetti();
          playCongratsSound();
        }
        window.RT?.refreshUserUI?.();
        refreshBonusState();
        spinBtn.classList.remove("is-loading");
      });
    } catch (err) {
      showMessage("Could not reach the server. Is the FastAPI backend running?");
      spinBtn.classList.remove("is-loading");
      spinBtn.disabled = false;
    }
  });

  function spinTo(segmentIndex, onDone) {
    const segmentCenter = segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const fullSpins = 10 * 360;

    // Rotate so the winning segment's exact center lands under the top pointer —
    // no jitter, so what the wheel visually lands on always matches the awarded amount.
    const targetWithinTurn = 360 - segmentCenter;
    cumulativeRotation += fullSpins + targetWithinTurn - (cumulativeRotation % 360);

    wheel.classList.add("spinning");
    wheel.style.transform = `rotate(${cumulativeRotation}deg)`;

    const handleEnd = (e) => {
      if (e.target !== wheel) return;
      wheel.removeEventListener("transitionend", handleEnd);
      onDone();
    };
    wheel.addEventListener("transitionend", handleEnd);
  }

  // ---------- Win celebration: confetti + chime ----------
  const CONFETTI_COLORS = ["#6c5ce7", "#00d4ff", "#ff6ec7", "#2ecc71", "#ffb454"];

  function launchConfetti() {
    const container = document.getElementById("confettiContainer");
    if (!container) return;

    for (let i = 0; i < 120; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 240}px`);
      piece.style.setProperty("--spin", `${360 * (2 + Math.random() * 3)}deg`);

      const duration = 2.6 + Math.random() * 1.6;
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${Math.random() * 0.4}s`;

      container.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 1) * 1000);
    }
  }

  function playCongratsSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // ascending C-E-G-C chime

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;

        const startTime = ctx.currentTime + i * 0.11;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });

      setTimeout(() => ctx.close(), 1200);
    } catch (err) {
      // Audio blocked/unavailable — the confetti still shows.
    }
  }

  // ---------- Result modal ----------
  function openResultModal() {
    resultOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeResultModal() {
    resultOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  resultClose?.addEventListener("click", closeResultModal);
  resultDoneBtn?.addEventListener("click", closeResultModal);
  resultOverlay?.addEventListener("click", (e) => {
    if (e.target === resultOverlay) closeResultModal();
  });
  resultWithdrawBtn?.addEventListener("click", () => {
    closeResultModal();
    window.RT?.openWithdrawalModal?.();
  });

  refreshBonusState();

  window.RT = window.RT || {};
  window.RT.refreshBonusState = refreshBonusState;
});
