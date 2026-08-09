// Daily Bonus Wheel: renders the wheel, checks eligibility, spins, and reveals the result.
// Mirrors the backend's WHEEL_SEGMENTS in app/routers/bonus.py — keep the two in sync.

document.addEventListener("DOMContentLoaded", () => {
  const WHEEL_SEGMENTS = [0, 100, 0, 500, 0, 0, 25000, 0, 0, 50000];
  const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

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

  if (!wheel) return;

  let cumulativeRotation = 0;

  // ---------- Build wheel face: labels + rim bulbs ----------
  // Each label/bulb uses a zero-width "anchor" div sized to the desired radius
  // (a % of the wheel's own height works for width/height, unlike translate %,
  // which is relative to the element's own tiny box) and rotated from its top —
  // so its bottom end swings out to the right point at the right angle.
  WHEEL_SEGMENTS.forEach((amount, i) => {
    const angle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;

    const anchor = document.createElement("div");
    anchor.className = "wheel-label-anchor";
    anchor.style.transform = `rotate(${angle}deg)`;

    const label = document.createElement("span");
    label.className = "wheel-label";
    label.textContent = amount >= 1000 ? `Rs ${amount / 1000}K` : `Rs ${amount}`;
    label.style.transform = `translate(-50%, 50%) rotate(${-angle}deg)`;

    anchor.appendChild(label);
    wheelLabels.appendChild(anchor);
  });

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
      bonusSignupBtn.hidden = false;
      spinBtn.disabled = true;
      hideMessage();
      return;
    }

    bonusSignupBtn.hidden = true;

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
        openResultModal();
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
    const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.5);
    const fullSpins = 6 * 360;

    // Rotate so the winning segment's center lands under the top pointer.
    const targetWithinTurn = 360 - segmentCenter + jitter;
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

  refreshBonusState();

  window.RT = window.RT || {};
  window.RT.refreshBonusState = refreshBonusState;
});
