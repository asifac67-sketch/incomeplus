// Platform Growth chart: illustrative monthly investment volume, drawn as an
// SVG line/area chart with hover crosshair + tooltip, keyboard nav, and a table view.

document.addEventListener("DOMContentLoaded", () => {
  const svg = document.getElementById("marketChart");
  if (!svg) return;

  const wrap = document.querySelector(".market-chart-wrap");
  const tooltip = document.getElementById("marketTooltip");
  const tooltipMonth = document.getElementById("marketTooltipMonth");
  const tooltipValue = document.getElementById("marketTooltipValue");

  const totalVolumeEl = document.getElementById("marketTotalVolume");
  const growthDeltaEl = document.getElementById("marketGrowthDelta");
  const investorsEl = document.getElementById("marketInvestors");

  const tableToggle = document.getElementById("marketTableToggle");
  const tableWrap = document.getElementById("marketTableWrap");
  const tableBody = document.getElementById("marketTableBody");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEW_W = 760;
  const VIEW_H = 300;
  const PAD = { left: 54, right: 14, top: 22, bottom: 34 };
  const PLOT_W = VIEW_W - PAD.left - PAD.right;
  const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
  const BASELINE_Y = PAD.top + PLOT_H;

  const ACTIVE_INVESTORS = 214;

  // Illustrative monthly investment volume (Rs) — realistic upward trend with minor dips
  const VALUES = [180000, 205000, 195000, 240000, 275000, 260000, 310000, 350000, 330000, 410000, 460000, 520000];

  function lastNMonthLabels(n) {
    const labels = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleDateString("en-US", { month: "short" }));
    }
    return labels;
  }

  const MONTHS = lastNMonthLabels(VALUES.length);

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#00d4ff";
  const gridColor = "rgba(255, 255, 255, 0.08)";
  const mutedColor = "rgba(245, 247, 255, 0.48)";
  const primaryColor = "#f5f7ff";

  function formatCompactRs(value) {
    if (value >= 1000) {
      const k = value / 1000;
      return `Rs ${Number.isInteger(k) ? k : k.toFixed(1)}K`;
    }
    return `Rs ${value}`;
  }

  function formatFullRs(value) {
    return `Rs ${Number(value).toLocaleString("en-US")}`;
  }

  // ---------- Scales ----------
  const rawMax = Math.max(...VALUES);
  const niceMax = Math.ceil((rawMax * 1.15) / 150000) * 150000;
  const ticks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax];

  function scaleX(index) {
    return PAD.left + (index / (VALUES.length - 1)) * PLOT_W;
  }
  function scaleY(value) {
    return PAD.top + PLOT_H - (value / niceMax) * PLOT_H;
  }

  const points = VALUES.map((v, i) => ({ x: scaleX(i), y: scaleY(v), value: v, month: MONTHS[i] }));

  // ---------- Smooth path (Catmull-Rom -> Bezier) ----------
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x},${BASELINE_Y} L ${points[0].x},${BASELINE_Y} Z`;

  // ---------- Build SVG ----------
  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  const defs = el("defs", {});
  const gradient = el("linearGradient", { id: "marketAreaGradient", x1: "0", y1: "0", x2: "0", y2: "1" });
  gradient.appendChild(el("stop", { offset: "0%", "stop-color": accentColor, "stop-opacity": "0.22" }));
  gradient.appendChild(el("stop", { offset: "100%", "stop-color": accentColor, "stop-opacity": "0" }));
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // Gridlines + y-axis labels
  ticks.forEach((tickValue) => {
    const y = scaleY(tickValue);
    svg.appendChild(el("line", { x1: PAD.left, x2: VIEW_W - PAD.right, y1: y, y2: y, stroke: gridColor, "stroke-width": "1" }));

    const label = el("text", { x: PAD.left - 10, y: y + 4, "text-anchor": "end", fill: mutedColor, "font-size": "11", "font-family": "Inter, sans-serif" });
    label.textContent = formatCompactRs(tickValue);
    svg.appendChild(label);
  });

  // X-axis month labels (every other month to avoid crowding on narrow screens)
  points.forEach((p, i) => {
    if (i % 2 !== 0 && i !== points.length - 1) return;
    const label = el("text", { x: p.x, y: VIEW_H - 10, "text-anchor": "middle", fill: mutedColor, "font-size": "11", "font-family": "Inter, sans-serif" });
    label.textContent = p.month;
    svg.appendChild(label);
  });

  // Area + line
  const areaEl = el("path", { d: areaPath, fill: "url(#marketAreaGradient)", stroke: "none" });
  svg.appendChild(areaEl);

  const lineEl = el("path", {
    d: linePath,
    fill: "none",
    stroke: accentColor,
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "market-line-draw",
  });
  svg.appendChild(lineEl);

  // Animate line draw-in
  requestAnimationFrame(() => {
    const length = lineEl.getTotalLength();
    lineEl.style.strokeDasharray = `${length}`;
    lineEl.style.strokeDashoffset = `${length}`;
    lineEl.getBoundingClientRect(); // force reflow
    lineEl.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
    lineEl.style.strokeDashoffset = "0";
  });

  // End marker + pulse + direct label
  const lastPoint = points[points.length - 1];
  const pulseCircle = el("circle", { cx: lastPoint.x, cy: lastPoint.y, r: "5", class: "market-pulse-dot", fill: accentColor });
  svg.appendChild(pulseCircle);

  const endDot = el("circle", { cx: lastPoint.x, cy: lastPoint.y, r: "5", fill: accentColor, stroke: "#0b0f1e", "stroke-width": "2" });
  svg.appendChild(endDot);

  const endLabelX = Math.min(lastPoint.x + 10, VIEW_W - PAD.right - 4);
  const endLabel = el("text", {
    x: endLabelX,
    y: lastPoint.y - 10,
    "text-anchor": lastPoint.x + 60 > VIEW_W - PAD.right ? "end" : "start",
    fill: primaryColor,
    "font-size": "13",
    "font-weight": "700",
    "font-family": "Sora, sans-serif",
  });
  endLabel.textContent = formatCompactRs(lastPoint.value);
  svg.appendChild(endLabel);

  // ---------- Crosshair + hover dot ----------
  const crosshair = el("line", {
    x1: lastPoint.x, x2: lastPoint.x, y1: PAD.top, y2: BASELINE_Y,
    stroke: "rgba(255,255,255,0.25)", "stroke-width": "1", visibility: "hidden",
  });
  svg.appendChild(crosshair);

  const hoverDot = el("circle", { r: "5", fill: accentColor, stroke: "#0b0f1e", "stroke-width": "2", visibility: "hidden" });
  svg.appendChild(hoverDot);

  let activeIndex = null;

  function showHover(index) {
    activeIndex = index;
    const p = points[index];

    crosshair.setAttribute("x1", p.x);
    crosshair.setAttribute("x2", p.x);
    crosshair.setAttribute("visibility", "visible");

    hoverDot.setAttribute("cx", p.x);
    hoverDot.setAttribute("cy", p.y);
    hoverDot.setAttribute("visibility", "visible");

    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const px = svgRect.left - wrapRect.left + (p.x / VIEW_W) * svgRect.width;
    const py = svgRect.top - wrapRect.top + (p.y / VIEW_H) * svgRect.height;

    tooltip.style.left = `${px}px`;
    tooltip.style.top = `${py}px`;
    tooltipMonth.textContent = p.month;
    tooltipValue.textContent = formatFullRs(p.value);
    tooltip.hidden = false;
  }

  function hideHover() {
    activeIndex = null;
    crosshair.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  }

  function nearestIndexFromClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    const xInView = ((clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - xInView);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    return nearest;
  }

  svg.addEventListener("pointermove", (e) => showHover(nearestIndexFromClientX(e.clientX)));
  svg.addEventListener("pointerleave", hideHover);

  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showHover(Math.min(points.length - 1, (activeIndex ?? points.length - 1) + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      showHover(Math.max(0, (activeIndex ?? points.length - 1) - 1));
    }
  });
  svg.addEventListener("focus", () => showHover(points.length - 1));
  svg.addEventListener("blur", hideHover);

  // ---------- Headline stats ----------
  const firstValue = VALUES[0];
  const lastValue = VALUES[VALUES.length - 1];
  const growthPct = Math.round(((lastValue - firstValue) / firstValue) * 100);

  totalVolumeEl.textContent = formatFullRs(lastValue);
  growthDeltaEl.textContent = `${growthPct >= 0 ? "+" : ""}${growthPct}%`;
  growthDeltaEl.classList.add(growthPct >= 0 ? "up" : "down");
  investorsEl.textContent = ACTIVE_INVESTORS.toLocaleString("en-US");

  // ---------- Table view (accessibility fallback) ----------
  tableBody.innerHTML = points
    .map((p) => `<tr><td>${p.month}</td><td>${formatFullRs(p.value)}</td></tr>`)
    .join("");

  tableToggle?.addEventListener("click", () => {
    const isHidden = tableWrap.hidden;
    tableWrap.hidden = !isHidden;
    tableToggle.classList.toggle("active", isHidden);
    tableToggle.querySelector("span").textContent = isHidden ? "Hide data table" : "View data as table";
  });
});
