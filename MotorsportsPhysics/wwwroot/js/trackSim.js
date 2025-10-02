// Simple SVG path-following animation for Blazor
// Exports init(svgEl, { speed }) which returns an object with play/pause/setSpeed/reset/dispose

/**
 * @param {SVGSVGElement} svgEl - The SVG root containing #racePath and car sprites (.carSprite or #carSprite)
 * @param {{speed?: number, startRotation?: number, angleSmoothing?: number}} opts
 */
export function init(svgEl, opts = {}) {
  // DEBUG logging toggle
  const DEBUG = false;
  const dlog = (...args) => { try { if (DEBUG) console.log('[trackSim]', ...args); } catch { /* ignore */ } };
  // Internal test scaffolding removed for production
  const FORCE_FIRST_LAP_TEST = false; // deprecated
  let testTickerAttached = false; // deprecated
  const speed = opts.speed ?? 140; // px / s along path length
  const path = /** @type {SVGPathElement} */ (svgEl.querySelector('#racePath'));
  const path2 = /** @type {SVGPathElement} */ (svgEl.querySelector('#racePath2'));
  if (!path) throw new Error('Missing #racePath in SVG');
  // Gather cars: prefer any elements with class .carSprite; fallback to legacy #carSprite if present
  const carNodeList = /** @type {NodeListOf<SVGImageElement>} */ (svgEl.querySelectorAll('.carSprite'));
  const cars = Array.from(carNodeList);
  if (cars.length === 0) {
    const legacy = /** @type {SVGImageElement|null} */ (svgEl.querySelector('#carSprite'));
    if (legacy) cars.push(legacy);
  }
  if (cars.length === 0) throw new Error('No car sprites found (.carSprite or #carSprite)');
  // Lane 2 (second path) screen-space Y offset in pixels. Cars using lane 2 and the visible path are both shifted by this.
  // Can be overridden via opts.lane2YOffset; defaults to 20px as requested.
  const lane2YOffset = Number(opts.lane2YOffset) || 23;

  let playing = false;
  // Base speed from app logic; effective speed may be reduced by penalty multiplier
  let pxPerSecBase = speed;
  let penaltyMul = 1.0;
  let pxPerSec = pxPerSecBase * penaltyMul;
  let startTime = 0;
  let traveled = 0; // pixels along the path
  // Absolute distance traveled accumulators (px) for progress reporting
  let userAbsTraveled = 0; // user car
  /** @type {Map<SVGImageElement, number>} */
  const aiAbsTraveled = new Map(); // per-NPC absolute distance
  // Per-lap telemetry storage; snapshot all cars each time the user crosses start/finish
  /** @type {Array<{lap:number, elapsedMs:number, samples:Array<{idx:number,id:string,isUser:boolean,color:string,distancePx:number}>}>} */
  const lapsTelemetry = [];
  let raceStartMsGlobal = 0;
  const extractColor = (imgEl) => {
    try {
      const href = imgEl.getAttribute('href') || '';
      const m = href.match(/car-([a-zA-Z]+)/);
      return m ? m[1].toLowerCase() : (imgEl.id || `car${(cars.indexOf(imgEl)+1)}`);
    } catch { return imgEl.id || 'car'; }
  };
  let rafId = 0;
  let startSampleTimer = 0; // timer id for sampling start position from the sprite
  // Medium-only minimum speed floor (px/s): when gateByAnsweredCount is false (Medium),
  // enforce an effective speed >= 70 after the car first reaches that speed during the initial ramp.
  // Read directly from opts here to avoid referencing variables declared later.
  const minSpeedFloor = (opts.gateByAnsweredCount === false) ? 70 : 0;
  let floorArmed = false; // becomes true once pxPerSec reaches the floor once (avoids forcing ramp)
  // Quiz gating: only allow halting when a question is NOT answered and gating is enabled.
  // gateByAnsweredCount controls whether to pause when lapCounter > answeredCount (default true)
  let gateByAnsweredCount = (opts.gateByAnsweredCount !== undefined) ? !!opts.gateByAnsweredCount : true;
  // Default false so first lap completion can pause awaiting an initial answer (when gating is on).
  let questionAnswered = false;
  // Remember if we paused due to awaiting an answer, and what speed to restore on resume
  let pausedForQuestion = false;
  let lastNonZeroSpeed = 0;
  // Total questions user has answered (for lap gating)
  let answeredCount = 0;
  // Lap counter increments each time the car returns to start (first return => lap 1)
  let lapCounter = 0;
  // Penalty that lasts until the next completed lap (null when inactive)
  let penaltyUntilLap = null;
  
  // Note: Speed remains constant across laps unless explicitly adjusted by app logic
  // Optional .NET listener for speed updates
  /** @type {any|null} */
  let speedListener = null;
  let lastSpeedEmitMs = 0;
  let lastSpeedReported = NaN;
  const emitSpeed = (force = false) => {
    try {
      if (!speedListener) return;
      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // Throttle to ~6 Hz unless forced
      if (!force && nowMs - lastSpeedEmitMs < 160) return;
  const v = Math.round(pxPerSec);
      if (!force && v === lastSpeedReported) return;
      lastSpeedReported = v;
      lastSpeedEmitMs = nowMs;
      speedListener.invokeMethodAsync('OnSpeedChanged', v);
    } catch { /* ignore */ }
  };
  const registerSpeedListener = (dotNetRef) => {
    try { speedListener = dotNetRef; emitSpeed(true); } catch { speedListener = null; }
  };
  const unregisterSpeedListener = () => { speedListener = null; };
  // Optional .NET listener for lap updates
  /** @type {any|null} */
  let lapListener = null;
  let lastLapReported = NaN;
  const emitLap = (force = false) => {
    try {
      if (!lapListener) return;
      const v = Number(lapCounter);
      if (!force && v === lastLapReported) return;
      lastLapReported = v;
      lapListener.invokeMethodAsync('OnLapChanged', v);
    } catch { /* ignore */ }
  };
  const registerLapListener = (dotNetRef) => {
    try { lapListener = dotNetRef; emitLap(true); } catch { lapListener = null; }
  };
  const unregisterLapListener = () => { lapListener = null; };
  /** @type {Set<(dt:number)=>boolean>} */
  const tickers = new Set(); // per-frame observers; return true to unregister

  // Identify the user car (yellow): prefer element with id="carSprite", otherwise the first car
  /** @type {SVGImageElement} */
  const userCar = cars.find(c => c.id === 'carSprite') || cars[0];
  // For non-user cars, keep an absolute speed (px/s) and a relative distance offset vs user (px)
  /** @type {Map<SVGImageElement, number>} */
  const aiAbsSpeed = new Map();
  /** @type {Map<SVGImageElement, number>} */
  const aiRelDist = new Map();
  // Per-NPC per-lap boost configuration (px/s added after each completed user lap)
  const aiLapBoostMin = Number(opts.aiLapBoostMin) || 15;
  const aiLapBoostMax = Number(opts.aiLapBoostMax) || 25;
  /** @type {Map<SVGImageElement, number>} */
  const aiLapBoost = new Map();
  // Initialize AI speeds to the current base speed and zero relative distance
  for (const c of cars) {
    if (c === userCar) continue;
    aiAbsSpeed.set(c, pxPerSec);
    aiRelDist.set(c, 0);
    // Assign a per-car boost in [aiLapBoostMin, aiLapBoostMax]
    const boost = aiLapBoostMin + Math.random() * Math.max(0, aiLapBoostMax - aiLapBoostMin);
    aiLapBoost.set(c, boost);
    aiAbsTraveled.set(c, 0);
  }
  // Track the planned number of laps when playForLaps is used (0 means unknown/open)
  let targetLapsGlobal = 0;

  // transform applied to the path (applied as an SVG transform on the path element)
  let tx = 0, ty = 0, s = 1;
  const mapPoint = (pt) => ({ x: pt.x * s + tx, y: pt.y * s + ty });
  // rotation offset in degrees applied to the car orientation
  let rotationOffset = Number(opts.startRotation) || 0;
  // smoothing factor for angle changes (0..1). Higher = faster response, lower = smoother.
  let angleAlpha = Number.isFinite(Number(opts.angleSmoothing)) ? Number(opts.angleSmoothing) : 0.18;
  let prevAngleDeg = undefined; // previous smoothed angle in degrees

  // Per-car previous angle smoothing and size cache
  /** @type {Map<SVGImageElement, number>} */
  const prevAngleDegMap = new Map();
  /** @type {Map<SVGImageElement, {w:number,h:number}>>} */
  const sizeMap = new Map();

  const total = path.getTotalLength();
  const total2 = path2 ? path2.getTotalLength() : total;
  // optional starting offset fraction along the path (-1..1). Positive goes forward; negative earlier/back.
  let startOffsetFrac = Number(opts.startOffsetFrac);
  if (!Number.isFinite(startOffsetFrac)) startOffsetFrac = 0;
  // Our animation runs anticlockwise (we decrease traveled), so to move the apparent start earlier (back), we increase traveled.
  if (startOffsetFrac !== 0) {
    traveled = (traveled + startOffsetFrac * total) % total;
    if (traveled < 0) traveled += total;
  }
  // Boundary for 'start/finish' detection aligned to visible start (based on StartOffsetFraction)
  const boundary = ((startOffsetFrac * total) % total + total) % total;
  const shifted = (val) => (((val - boundary) % total) + total) % total; // rotate so boundary→0
  // Starting reference coordinate for proximity detection
  let startLen = traveled;
  let _startPt = path.getPointAtLength(startLen);
  let startX = _startPt.x * s + tx;
  let startY = _startPt.y * s + ty;
  const showStartMarker = !!opts.showStartMarker;
  /** @type {SVGCircleElement|null} */
  let startMarker = null;
  function updateStartMarker() {
    try {
      if (!showStartMarker) return; // disabled
      if (!startMarker) {
        startMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        startMarker.setAttribute('r', '4');
        startMarker.setAttribute('fill', 'limegreen');
        startMarker.setAttribute('stroke', '#0a0');
        startMarker.setAttribute('stroke-width', '1.5');
        startMarker.setAttribute('pointer-events', 'none');
        startMarker.setAttribute('class', 'start-marker');
        // Append at end so it renders on top of other shapes
        svgEl.appendChild(startMarker);
      }
      startMarker.setAttribute('cx', startX.toFixed(2));
      startMarker.setAttribute('cy', startY.toFixed(2));
    } catch { /* ignore */ }
  }
  function recomputeStartXY() {
    const m = mapPoint(path.getPointAtLength(startLen));
    startX = m.x; startY = m.y;
    dlog('startXY', { startX: Number(startX.toFixed(2)), startY: Number(startY.toFixed(2)), startLen: Number(startLen.toFixed(2)) });
    updateStartMarker();
  }
  dlog('init', { speed, rotationOffset, angleAlpha, total, startOffsetFrac, lane2YOffset });

  // Throttled per-frame debug
  let stepLogAccum = 0;

  function step(ts) {
    if (!playing) return;
    if (!startTime) startTime = ts;
    const dt = (ts - startTime) / 1000; // s
    startTime = ts;
    // Arm min-speed floor once we naturally reach it (avoid affecting the start ramp)
    if (!floorArmed && minSpeedFloor > 0 && pxPerSec >= minSpeedFloor - 0.5) {
      floorArmed = true;
      dlog('minFloor:armed', { floor: minSpeedFloor, pxPerSec: Number(pxPerSec.toFixed(2)) });
    }
    // Enforce floor while playing after it’s armed
    if (floorArmed && minSpeedFloor > 0 && pxPerSec < minSpeedFloor) {
      pxPerSec = minSpeedFloor;
    }
    // move backwards by default so the car runs anticlockwise
    traveled = traveled - pxPerSec * dt;
    // normalize into [0, total)
    traveled = ((traveled % total) + total) % total;
    // accumulate absolute distance traveled for the user (non-negative)
    if (pxPerSec > 0) userAbsTraveled += pxPerSec * dt;
    // Update AI relative distances so their absolute speeds do not depend on the user's answers
    if (cars.length > 1) {
      for (const c of cars) {
        if (c === userCar) continue;
        const vAbs = aiAbsSpeed.get(c) || 0; // px/s, absolute for this AI car
        const vRel = vAbs - pxPerSec;        // relative to user's current speed
        if (vRel !== 0) aiRelDist.set(c, (aiRelDist.get(c) || 0) + vRel * dt);
        if (vAbs > 0) aiAbsTraveled.set(c, (aiAbsTraveled.get(c) || 0) + vAbs * dt);
      }
    }
    render(traveled);
    // Throttled state log (≈2x per second)
    stepLogAccum += dt;
    if (DEBUG && stepLogAccum >= 0.5) {
      dlog('step', { traveled: Number(traveled.toFixed(2)), pxPerSec: Number(pxPerSec.toFixed(2)), playing });
      stepLogAccum = 0;
    }
    // Notify per-frame tickers
    if (tickers.size) {
      // Copy to avoid mutation during iteration
      const copy = Array.from(tickers);
      for (const f of copy) {
        try {
          if (f(dt) === true) tickers.delete(f);
        } catch { /* ignore */ }
      }
    }
    rafId = requestAnimationFrame(step);
  }

  function render(lenBase) {
    const delta = 0.1;
  cars.forEach((carEl) => {
      // offset per car through data-offset in [0..1) fraction of total length
      const offsetFrac = Number(carEl.getAttribute('data-offset') || 0);
  const extra = (carEl === userCar) ? 0 : (aiRelDist.get(carEl) || 0);
  const len = ((lenBase - offsetFrac * total - extra) % total + total) % total;
      // size
      let sz = sizeMap.get(carEl);
      if (!sz) {
        sz = {
          w: Number(carEl.getAttribute('width') || 48),
          h: Number(carEl.getAttribute('height') || 28)
        };
        sizeMap.set(carEl, sz);
      }
  // Decide lane by grid-dy (or explicit data-lane). We no longer use dy==0 to suppress dx/dy adjustments.
  const dyRaw = Number(carEl.getAttribute('data-grid-dy') || 0) || 0;
  const isBaseGroup = Math.abs(dyRaw) < 1e-6;
  // Prefer explicit data-lane when provided; otherwise fallback to dy-based grouping
  const hasLane = carEl.hasAttribute('data-lane');
  const laneVal = hasLane ? Number(carEl.getAttribute('data-lane') || 1) : 1;
  const useLane2 = hasLane ? (laneVal === 2 && !!path2) : (!isBaseGroup && !!path2);
  // Use the actual geometry of the selected lane's path
  const samplePath = (useLane2 && path2) ? path2 : path;
  const sampleTotal = (samplePath === path2 && path2) ? total2 : total;
  const lenNorm = len / total; // 0..1 in main path domain
  // Sample along the same fraction of the selected lane's total length
  const laneLen = lenNorm * sampleTotal;
  const lenPrevMain = ((((len - delta) % total) + total) % total);
  const laneLenPrev = (lenPrevMain / total) * sampleTotal;
    const p = samplePath.getPointAtLength(laneLen);
    const p2 = samplePath.getPointAtLength(laneLenPrev);
  let mappedX = p.x * s + tx;
  let mappedY = p.y * s + ty;
  let mappedPx2X = p2.x * s + tx;
  let mappedPx2Y = p2.y * s + ty;
      // Apply lane-2 specific offset to screen-space mapping so cars follow the visually shifted path
      if (samplePath === path2) {
        mappedY += lane2YOffset;
        mappedPx2Y += lane2YOffset;
      }
      const targetAngleDeg = Math.atan2(mappedPx2Y - mappedY, mappedPx2X - mappedX) * 180 / Math.PI;
      let prev = prevAngleDegMap.get(carEl);
      if (prev === undefined) prev = targetAngleDeg;
      const diff = ((((targetAngleDeg - prev) + 540) % 360) - 180);
      const smoothedAngleDeg = prev + diff * angleAlpha;
      prevAngleDegMap.set(carEl, smoothedAngleDeg);
      const finalAngle = smoothedAngleDeg + rotationOffset;
      // center and rotate
  // Optional per-car deltas for fine tuning (apply to both position and rotation pivot)
  // Support multiple attribute names for convenience: data-grid-dx/dy, data-dx/dy, dx/dy
  const dxAttr = carEl.getAttribute('data-grid-dx') ?? carEl.getAttribute('data-dx') ?? carEl.getAttribute('dx') ?? '0';
  const dyAttr = carEl.getAttribute('data-grid-dy') ?? carEl.getAttribute('data-dy') ?? carEl.getAttribute('dy') ?? '0';
  const dxAdj = Number(dxAttr) || 0;
  const dyAdj = Number(dyAttr) || 0;
  const adjX = mappedX + dxAdj;
  const adjY = mappedY + dyAdj;
  const x = adjX - sz.w / 2;
  const y = adjY - sz.h / 2;
  carEl.setAttribute('x', x.toFixed(2));
  carEl.setAttribute('y', y.toFixed(2));
  carEl.setAttribute('transform', `rotate(${finalAngle.toFixed(2)} ${adjX.toFixed(2)} ${adjY.toFixed(2)})`);
    });
  }

  function play() {
    if (playing) return;
    playing = true;
    startTime = 0;
    dlog('play');
    let playStartMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!raceStartMsGlobal) raceStartMsGlobal = playStartMs;
    // Sample the absolute car position ~1s after play starts (while speed is still 0 due to start delay)
    // This captures the true start center without caring about scale/translation math.
    const SPEED_EPS = 0.1; // px/s
    try { if (startSampleTimer) { clearTimeout(startSampleTimer); startSampleTimer = 0; } } catch {}
    startSampleTimer = setTimeout(() => {
      try {
        if (!playing) return;
        // If we already started moving, skip sampling to avoid capturing a moved point
        if (pxPerSec > SPEED_EPS) return;
        // Prefer a car with data-offset == 0, otherwise take the first
        const carEl = cars.find(c => Number(c.getAttribute('data-offset') || 0) === 0) || cars[0];
        let sz = sizeMap.get(carEl);
        if (!sz) {
          sz = {
            w: Number(carEl.getAttribute('width') || 48),
            h: Number(carEl.getAttribute('height') || 28)
          };
          sizeMap.set(carEl, sz);
        }
        const xAttr = Number(carEl.getAttribute('x'));
        const yAttr = Number(carEl.getAttribute('y'));
        if (Number.isFinite(xAttr) && Number.isFinite(yAttr)) {
          startX = xAttr + sz.w / 2;
          startY = yAttr + sz.h / 2;
          const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          dlog('startXY:sampledFromSprite', { startX: Number(startX.toFixed(2)), startY: Number(startY.toFixed(2)), elapsedMs: Math.round(nowMs - playStartMs) });
          updateStartMarker();
        }
      } catch { /* ignore */ }
    }, 1000);
    // Attach test ticker if requested and not already attached
  if (FORCE_FIRST_LAP_TEST && !testTickerAttached) {
      let lapsDone = 0;
      let lastShift = shifted(traveled);
      dlog('testTicker:attach');
      const ticker = (dt) => {
        const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const curShift = shifted(traveled);
        // Ignore any wraps for a short grace period right after play
        if (nowMs - playStartMs < 500) {
          lastShift = curShift;
          return false;
        }
        if (curShift > lastShift) {
          lapsDone++;
          dlog('testTicker:wrap', { lapsDone, curShift: Number(curShift.toFixed(2)), lastShift: Number(lastShift.toFixed(2)) });
        }
        lastShift = curShift;
        if (lapsDone >= 1) {
          dlog('testTicker:halt');
          try { setSpeed(0); } catch {}
          try { pause(); } catch {}
          testTickerAttached = false;
          return true; // unregister
        }
        return false;
      };
      tickers.add(ticker);
      testTickerAttached = true;
    }
    // Attach a non-halting logger that reports each time we return near the starting coordinate (with hysteresis)
    // If you set these to 0, we will use a tiny epsilon so floating-point rounding doesn't prevent a trigger
  const innerR_log = 1, outerR_log = 1;
    const EPS_LOG = 0.25; // px
    const innerEff = innerR_log <= 0 ? EPS_LOG : innerR_log;
    const outerEff = outerR_log <= 0 ? innerEff + EPS_LOG : Math.max(outerR_log, innerEff + EPS_LOG);
    // Start inside so we only report after leaving and returning
    let wasOutside_log = false;
    let lastReportMs = 0;
    const logger = (dt) => {
      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const p = path.getPointAtLength(traveled);
      const m = { x: p.x * s + tx, y: p.y * s + ty };
      const dx = m.x - startX, dy = m.y - startY;
      const dist = Math.hypot(dx, dy);
      if (wasOutside_log && dist <= innerEff) {
        if (!lastReportMs || nowMs - lastReportMs > 500) {
          lapCounter += 1;
          dlog('start-return', { dist: Number(dist.toFixed(2)), lap: lapCounter, answeredCount });
          try { emitSpeed(true); } catch {}
          try { emitLap(true); } catch {}
          // Snapshot telemetry for all cars at this lap crossing
          try {
            const elapsedMs = Math.max(0, nowMs - (raceStartMsGlobal || nowMs));
            const samples = cars.map((c, idx) => {
              const isUser = (c === userCar);
              const distancePx = isUser ? userAbsTraveled : (aiAbsTraveled.get(c) || 0);
              return { idx, id: c.id || '', isUser, color: extractColor(c), distancePx };
            });
            lapsTelemetry.push({ lap: lapCounter, elapsedMs, samples });
          } catch { /* ignore */ }
          // AI: after each completed user lap, give all non-user cars their per-car absolute speed boost
          try {
            const applied = [];
            for (const c of cars) {
              if (c === userCar) continue;
              const cur = aiAbsSpeed.get(c) || 0;
              const inc = aiLapBoost.get(c) ?? (aiLapBoostMin + Math.random() * Math.max(0, aiLapBoostMax - aiLapBoostMin));
              aiAbsSpeed.set(c, cur + inc);
              applied.push({ idx: cars.indexOf(c), inc: Number(inc.toFixed(1)) });
            }
            dlog('ai:lapBoost', { lap: lapCounter, applied });
          } catch { /* ignore */ }
          // If a lap-long penalty was set, and we've reached or passed the target lap, clear it now
          if (penaltyUntilLap !== null && lapCounter >= penaltyUntilLap) {
            penaltyUntilLap = null;
            penaltyMul = 1.0;
            pxPerSec = pxPerSecBase * penaltyMul;
            dlog('penalty:clearOnLap', { lapCounter, base: pxPerSecBase, pxPerSec });
            emitSpeed(true);
          }
          lastReportMs = nowMs;
          // Gate: if enabled and user hasn't answered at least 'lapCounter' questions,
          // stop ONLY the user car at start/finish but keep the engine running so AI continue moving.
          if (gateByAnsweredCount && answeredCount < lapCounter) {
            // Snap to the exact start point, then stop
            try { traveled = startLen; render(traveled); } catch {}
            try { setSpeed(0); } catch {}
            try { emitSpeed(true); } catch {}
            // Keep current lap value visible while paused
            try { emitLap(true); } catch {}
            pausedForQuestion = true;
            // Do NOT pause the whole animation; keep RAF running so AI keep advancing
            // Keep logger active for future laps
            return false;
          }
          // If the question is already answered, keep running and continue logging future laps
          wasOutside_log = false;
          return false;
        }
        wasOutside_log = false;
      } else if (!wasOutside_log && dist >= outerEff) {
        wasOutside_log = true;
      }
      return false;
    };
    tickers.add(logger);
    rafId = requestAnimationFrame(step);
  }
  function pause() {
    playing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    try { if (startSampleTimer) { clearTimeout(startSampleTimer); startSampleTimer = 0; } } catch {}
    dlog('pause');
  }
  function reset() {
    pause();
    traveled = 0;
    userAbsTraveled = 0;
    try {
      aiAbsTraveled.clear();
      for (const c of cars) { if (c !== userCar) aiAbsTraveled.set(c, 0); }
    } catch {}
    lapCounter = 0;
    lapsTelemetry.length = 0;
    raceStartMsGlobal = 0;
    if (startOffsetFrac !== 0) {
      traveled = (traveled + startOffsetFrac * total) % total;
      if (traveled < 0) traveled += total;
    }
    startLen = traveled;
    recomputeStartXY();
    render(traveled);
    try { emitLap(true); } catch {}
    dlog('reset', { traveled });
  }
  function setSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    // Allow 0 to keep the car stationary; negative values treated as 0
    pxPerSecBase = Math.max(0, n);
    pxPerSec = pxPerSecBase * penaltyMul;
    // Apply floor if armed (Medium only) but do not arm here
    if (floorArmed && minSpeedFloor > 0 && pxPerSec < minSpeedFloor) {
      pxPerSec = minSpeedFloor;
    }
    if (pxPerSec > 0) lastNonZeroSpeed = pxPerSec;
    dlog('setSpeed', { input: v, base: pxPerSecBase, penaltyMul, pxPerSec });
    // Force immediate emit when transitioning to zero so UI reflects a stop even within throttle window
    emitSpeed(pxPerSec === 0);
  }

  function applyPenalty(multiplier, durationMs) {
    const m = Math.max(0, Math.min(1, Number(multiplier)));
    const d = Math.max(0, Number(durationMs) || 0);
    penaltyMul = m;
    pxPerSec = pxPerSecBase * penaltyMul;
    if (floorArmed && minSpeedFloor > 0 && pxPerSec < minSpeedFloor) {
      pxPerSec = minSpeedFloor;
    }
    dlog('applyPenalty', { multiplier: penaltyMul, durationMs: d, base: pxPerSecBase, pxPerSec });
    emitSpeed(true);
    if (d > 0) {
      try { clearTimeout(applyPenalty._t); } catch {}
      applyPenalty._t = setTimeout(() => {
        penaltyMul = 1.0;
        pxPerSec = pxPerSecBase * penaltyMul;
        dlog('penalty:end', { base: pxPerSecBase, pxPerSec });
        emitSpeed(true);
      }, d);
    }
  }
  // Apply a penalty multiplier that remains active until the next completed lap
  function applyPenaltyForNextLap(multiplier) {
    const m = Math.max(0, Math.min(1, Number(multiplier)));
    penaltyMul = m;
    pxPerSec = pxPerSecBase * penaltyMul;
    if (floorArmed && minSpeedFloor > 0 && pxPerSec < minSpeedFloor) {
      pxPerSec = minSpeedFloor;
    }
    penaltyUntilLap = (lapCounter || 0) + 1; // clear when lapCounter reaches this value
    dlog('applyPenaltyForNextLap', { multiplier: penaltyMul, clearAtLap: penaltyUntilLap, base: pxPerSecBase, pxPerSec });
    emitSpeed(true);
  }
  function setTransform(txNew, tyNew, sNew) {
    tx = Number(txNew) || 0;
    ty = Number(tyNew) || 0;
    s = Number(sNew) || 1;
  // apply to path elements so the visible guides move (both lanes share the same transform)
  if (path) path.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
  // For path2, append an extra translate AFTER scale so the 20px is in screen space (not scaled)
  if (path2) path2.setAttribute('transform', `translate(${tx} ${ty}) scale(${s}) translate(0 ${lane2YOffset})`);
    // re-render current position so the car updates immediately
    render(traveled);
    dlog('setTransform', { tx, ty, s });
    // Update starting coordinate due to transform change
    recomputeStartXY();
  }
  function setRotation(deg) {
    rotationOffset = Number(deg) || 0;
    // re-render so change takes effect immediately
    render(traveled);
    dlog('setRotation', { rotationOffset });
  }
  function adjustBaseSpeed(delta) {
    const d = Number(delta);
    if (!Number.isFinite(d)) return;
    const before = pxPerSecBase;
    pxPerSecBase = Math.max(0, pxPerSecBase + d);
    pxPerSec = pxPerSecBase * penaltyMul;
    if (floorArmed && minSpeedFloor > 0 && pxPerSec < minSpeedFloor) {
      pxPerSec = minSpeedFloor;
    }
    if (pxPerSec > 0) lastNonZeroSpeed = pxPerSec;
    dlog('adjustBaseSpeed', { before, delta: d, base: pxPerSecBase, penaltyMul, pxPerSec });
    emitSpeed(true);
  }
  function playForLaps(laps, _targetSpeed, haltOnFinish = true) {
    let targetLaps = Math.max(0, Number(laps) || 0);
    // TEMP TEST: also force stopping after the first lap here to mirror behavior
    if (FORCE_FIRST_LAP_TEST) targetLaps = 1;
    if (targetLaps === 0) return Promise.resolve();
    // Do not override an externally defined target laps (e.g., quiz total). Only set if unset or lower.
    if (!targetLapsGlobal || targetLapsGlobal < targetLaps) {
      targetLapsGlobal = targetLaps;
    }
    // Ensure running; do NOT force speed here so callers can apply their own delay/ramp
    play();
    // Count wraps of the start line instead of integrating distance to ensure precise stop
      // Keep cumulative progress across calls; do not reset distances or lap counter here
  let lastShift = shifted(traveled);
  let accumDist = 0; // px traveled irrespective of wraps
    // Hysteresis around start position to avoid multi-counting
    const innerR = 16; // px
    const outerR = 28; // px
    let wasOutside = true;
    let playStartMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    dlog('playForLaps:start', { requestedLaps: laps, targetLaps, haltOnFinish });
    return new Promise((resolve) => {
      const ticker = (dt) => {
        const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // If shifted traveled increased, we wrapped past the visible start/finish boundary
        const curShift = shifted(traveled);
        // Ignore wraps in the first 500ms to avoid false early wrap at movement start
        if (nowMs - playStartMs < 500) {
          lastShift = curShift;
          return false;
        }
        // accumulate distance using current speed
        accumDist += pxPerSec * dt;
        // Proximity-based lap count to starting coordinate (hysteresis)
        const curPoint = path.getPointAtLength(traveled);
        const curX = curPoint.x * s + tx;
        const curY = curPoint.y * s + ty;
        const dx = curX - startX;
        const dy = curY - startY;
        const dist = Math.hypot(dx, dy);
        if (wasOutside && dist <= innerR) {
          lapsDone++;
          wasOutside = false;
          dlog('lap++ proximity', { lapsDone, dist: Number(dist.toFixed(2)) });
        } else if (!wasOutside && dist >= outerR) {
          wasOutside = true;
        }
        if (curShift > lastShift) {
          lapsDone++;
          dlog('wrap', { lapsDone, curShift: Number(curShift.toFixed(2)), lastShift: Number(lastShift.toFixed(2)) });
        }
        lastShift = curShift;
        const targetDist = targetLaps * total;
        if (lapsDone >= targetLaps || accumDist >= targetDist) {
          if (haltOnFinish && (!questionAnswered && gateByAnsweredCount)) {
            dlog('halt', { reason: lapsDone >= targetLaps ? 'wraps' : 'distance-fallback', lapsDone, targetLaps, accumDist: Number(accumDist.toFixed(1)), targetDist: Number(targetDist.toFixed(1)) });
            // Snap to exact start for a perfect visual stop
            try { traveled = startLen; render(traveled); } catch {}
            try { setSpeed(0); } catch {}
            pausedForQuestion = true;
            // Do not pause the whole engine; AI should continue moving
          }
          dlog('playForLaps:resolve');
          resolve();
          return true; // unregister
        }
        return false;
      };
      tickers.add(ticker);
    });
  }
  // Allow host to define the planned total laps for progress fractions without altering play state
  function setTargetLaps(n) {
    const t = Math.max(0, Number(n) || 0);
    targetLapsGlobal = t;
    dlog('setTargetLaps', { targetLapsGlobal });
  }
  // Get per-lap telemetry snapshots collected at user start/finish crossings
  function getLapTelemetry() {
    return lapsTelemetry.slice();
  }
  // Clear collected lap telemetry and restart timing baseline
  function resetLapTelemetry() {
    try {
      lapsTelemetry.length = 0;
      raceStartMsGlobal = 0;
      dlog('resetLapTelemetry');
    } catch { }
  }
  // Report covered distances for all cars
  function getCoveredDistances() {
    /** @type {Array<{idx:number,id:string,isUser:boolean,distancePx:number,fractionOfRace:number|null}>} */
    const res = [];
    const getLaneTotal = (el) => {
      const hasLane = el.hasAttribute('data-lane');
      const laneVal = hasLane ? Number(el.getAttribute('data-lane') || 1) : 1;
      const useLane2 = hasLane ? (laneVal === 2 && !!path2) : false;
      return useLane2 && path2 ? total2 : total;
    };
    const targetPxPerCar = (el) => {
      if (!targetLapsGlobal || targetLapsGlobal <= 0) return null;
      return targetLapsGlobal * getLaneTotal(el);
    };
    cars.forEach((c, idx) => {
      const isUser = (c === userCar);
      const dist = isUser ? userAbsTraveled : (aiAbsTraveled.get(c) || 0);
      const tp = targetPxPerCar(c);
      const frac = tp ? Math.max(0, Math.min(1, dist / tp)) : null;
      res.push({ idx, id: c.id || '', isUser, distancePx: dist, fractionOfRace: frac });
    });
    return res;
  }
  function setQuestionAnswered(v) {
    questionAnswered = !!v;
    dlog('setQuestionAnswered', { questionAnswered });
    // If we were paused awaiting an answer and it's now answered, resume
    if (questionAnswered && pausedForQuestion) {
      try { play(); } catch { }
      // Restore last non-zero speed if we're currently at 0
      try { if (pxPerSec === 0 && lastNonZeroSpeed > 0) setSpeed(lastNonZeroSpeed); } catch { }
      pausedForQuestion = false;
    }
  }
  function setAnsweredCount(n) {
    const prev = answeredCount;
    answeredCount = Math.max(0, Number(n) || 0);
    dlog('setAnsweredCount', { answeredCount, prev, lapCounter, pausedForQuestion });
    // If we paused awaiting answers and the threshold is now satisfied, resume
    if (gateByAnsweredCount && pausedForQuestion && answeredCount >= lapCounter) {
      try { play(); } catch { }
      try { if (pxPerSec === 0 && lastNonZeroSpeed > 0) setSpeed(lastNonZeroSpeed); } catch { }
      pausedForQuestion = false;
    }
  }
  function setGateByAnsweredCount(v) {
    gateByAnsweredCount = !!v;
    dlog('setGateByAnsweredCount', { gateByAnsweredCount });
    // If gating just got disabled and we were paused for a question, resume immediately
    if (!gateByAnsweredCount && pausedForQuestion) {
      try { play(); } catch { }
      try { if (pxPerSec === 0 && lastNonZeroSpeed > 0) setSpeed(lastNonZeroSpeed); } catch { }
      pausedForQuestion = false;
    }
  }
  function getQuestionAnswered() {
    return !!questionAnswered;
  }
  function dispose() {
    pause();
    tickers.clear();
    unregisterSpeedListener();
    unregisterLapListener();
    dlog('dispose');
  }

  // Compute the user's current race position among all cars (1-based)
  function getUserRank() {
    try {
      const lenBase = traveled;
      const items = cars.map((carEl, idx) => {
        const offsetFrac = Number(carEl.getAttribute('data-offset') || 0);
        const extra = (carEl === userCar) ? 0 : (aiRelDist.get(carEl) || 0);
        const len = ((lenBase - offsetFrac * total - extra) % total + total) % total;
        return { el: carEl, idx, len };
      });
      const userItem = items.find(i => i.el === userCar);
      const userLen = userItem ? userItem.len : 0;
      let aheadCount = 0;
      for (const it of items) {
        if (it.el === userCar) continue;
        const ahead = ((userLen - it.len + total) % total);
        // If ahead in the current direction and within half a lap, consider it in front
        if (ahead > 1e-6 && ahead < total / 2) aheadCount++;
      }
      const position = aheadCount + 1;
      return { position, totalCars: cars.length };
    } catch {
      return { position: 1, totalCars: cars.length };
    }
  }

  // Initial render to place the car at the path start (with optional offset)
  render(traveled);

  return { play, pause, setSpeed, reset, dispose, setTransform, setRotation, adjustBaseSpeed, playForLaps, setQuestionAnswered, getQuestionAnswered, setAnsweredCount, setGateByAnsweredCount, registerSpeedListener, unregisterSpeedListener, registerLapListener, unregisterLapListener, applyPenalty, applyPenaltyForNextLap, getUserRank, getCoveredDistances, setTargetLaps, getLapTelemetry, resetLapTelemetry };
}
