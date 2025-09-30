// Simple SVG path-following animation for Blazor
// Exports init(svgEl, { speed }) which returns an object with play/pause/setSpeed/reset/dispose

/**
 * @param {SVGSVGElement} svgEl - The SVG root containing #racePath and car sprites (.carSprite or #carSprite)
 * @param {{speed?: number, startRotation?: number, angleSmoothing?: number}} opts
 */
export function init(svgEl, opts = {}) {
  // DEBUG logging toggle
  const DEBUG = true;
  const dlog = (...args) => { try { if (DEBUG) console.log('[trackSim]', ...args); } catch { /* ignore */ } };
  // TEMP TEST: globally force a hard stop after the first lap even if playForLaps isn't called
  const FORCE_FIRST_LAP_TEST = false;
  let testTickerAttached = false;
  const speed = opts.speed ?? 140; // px / s along path length
  const path = /** @type {SVGPathElement} */ (svgEl.querySelector('#racePath'));
  if (!path) throw new Error('Missing #racePath in SVG');
  // Gather cars: prefer any elements with class .carSprite; fallback to legacy #carSprite if present
  const carNodeList = /** @type {NodeListOf<SVGImageElement>} */ (svgEl.querySelectorAll('.carSprite'));
  const cars = Array.from(carNodeList);
  if (cars.length === 0) {
    const legacy = /** @type {SVGImageElement|null} */ (svgEl.querySelector('#carSprite'));
    if (legacy) cars.push(legacy);
  }
  if (cars.length === 0) throw new Error('No car sprites found (.carSprite or #carSprite)');

  let playing = false;
  let pxPerSec = speed;
  let startTime = 0;
  let traveled = 0; // pixels along the path
  let rafId = 0;
  let startSampleTimer = 0; // timer id for sampling start position from the sprite
  // Quiz gating: only allow halting when a question is NOT answered.
  // Default false so first lap completion can pause awaiting an initial answer.
  let questionAnswered = false;
  // Remember if we paused due to awaiting an answer, and what speed to restore on resume
  let pausedForQuestion = false;
  let lastNonZeroSpeed = 0;
  // Total questions user has answered (for lap gating)
  let answeredCount = 0;
  // Lap counter increments each time the car returns to start (first return => lap 1)
  let lapCounter = 0;
  // Per-lap speed model: speed(px/s) = BASE + lap * STEP
  const LAP_BASE = 100; // px/s
  const LAP_STEP = 45;  // px/s per lap
  const lapSpeedFor = (lap) => Math.max(0, LAP_BASE + lap * LAP_STEP);
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
  /** @type {Set<(dt:number)=>boolean>} */
  const tickers = new Set(); // per-frame observers; return true to unregister

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
  dlog('init', { speed, rotationOffset, angleAlpha, total, startOffsetFrac });

  // Throttled per-frame debug
  let stepLogAccum = 0;

  function step(ts) {
    if (!playing) return;
    if (!startTime) startTime = ts;
    const dt = (ts - startTime) / 1000; // s
    startTime = ts;
    // move backwards by default so the car runs anticlockwise
    traveled = traveled - pxPerSec * dt;
    // normalize into [0, total)
    traveled = ((traveled % total) + total) % total;
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
      const len = ((lenBase - offsetFrac * total) % total + total) % total;
      // size
      let sz = sizeMap.get(carEl);
      if (!sz) {
        sz = {
          w: Number(carEl.getAttribute('width') || 48),
          h: Number(carEl.getAttribute('height') || 28)
        };
        sizeMap.set(carEl, sz);
      }
      // position and tangent
      const p = path.getPointAtLength(len);
      const p2 = path.getPointAtLength((len - delta + total) % total);
      const mappedX = p.x * s + tx;
      const mappedY = p.y * s + ty;
      const mappedPx2X = p2.x * s + tx;
      const mappedPx2Y = p2.y * s + ty;
      const targetAngleDeg = Math.atan2(mappedPx2Y - mappedY, mappedPx2X - mappedX) * 180 / Math.PI;
      let prev = prevAngleDegMap.get(carEl);
      if (prev === undefined) prev = targetAngleDeg;
      const diff = ((((targetAngleDeg - prev) + 540) % 360) - 180);
      const smoothedAngleDeg = prev + diff * angleAlpha;
      prevAngleDegMap.set(carEl, smoothedAngleDeg);
      const finalAngle = smoothedAngleDeg + rotationOffset;
      // center and rotate
      const x = mappedX - sz.w / 2;
      const y = mappedY - sz.h / 2;
      carEl.setAttribute('x', x.toFixed(2));
      carEl.setAttribute('y', y.toFixed(2));
      carEl.setAttribute('transform', `rotate(${finalAngle.toFixed(2)} ${mappedX.toFixed(2)} ${mappedY.toFixed(2)})`);
    });
  }

  function play() {
    if (playing) return;
    playing = true;
    startTime = 0;
    dlog('play');
    let playStartMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
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
          const newLapSpeed = lapSpeedFor(lapCounter);
          dlog('start-return', { dist: Number(dist.toFixed(2)), lap: lapCounter, answeredCount, newLapSpeed });
          try { dlog("New speed: " + newLapSpeed); setSpeed(newLapSpeed); } catch {}
          try { emitSpeed(true); } catch {}
          lastReportMs = nowMs;
          // Gate: if user hasn't answered at least 'lapCounter' questions, pause at start
          if (answeredCount < lapCounter) {
            // Snap to the exact start point, then stop
            try { traveled = startLen; render(traveled); } catch {}
            try { setSpeed(0); } catch {}
            try { emitSpeed(true); } catch {}
            pausedForQuestion = true;
            try { pause(); } catch {}
            return true; // unregister this logger (we halted)
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
    lapCounter = 0;
    if (startOffsetFrac !== 0) {
      traveled = (traveled + startOffsetFrac * total) % total;
      if (traveled < 0) traveled += total;
    }
    startLen = traveled;
    recomputeStartXY();
    render(traveled);
    dlog('reset', { traveled });
  }
  function setSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    // Allow 0 to keep the car stationary; negative values treated as 0
    pxPerSec = Math.max(0, n);
    if (pxPerSec > 0) lastNonZeroSpeed = pxPerSec;
    dlog('setSpeed', { input: v, pxPerSec });
    // Force immediate emit when transitioning to zero so UI reflects a stop even within throttle window
    emitSpeed(pxPerSec === 0);
  }
  function setTransform(txNew, tyNew, sNew) {
    tx = Number(txNew) || 0;
    ty = Number(tyNew) || 0;
    s = Number(sNew) || 1;
    // apply to path element so the visible guide moves
    path.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
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
  function playForLaps(laps, _targetSpeed, haltOnFinish = true) {
    let targetLaps = Math.max(0, Number(laps) || 0);
    // TEMP TEST: also force stopping after the first lap here to mirror behavior
    if (FORCE_FIRST_LAP_TEST) targetLaps = 1;
    if (targetLaps === 0) return Promise.resolve();
    // Ensure running; do NOT force speed here so callers can apply their own delay/ramp
    play();
    // Count wraps of the start line instead of integrating distance to ensure precise stop
  let lapsDone = 0;
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
          if (haltOnFinish && !questionAnswered) {
            dlog('halt', { reason: lapsDone >= targetLaps ? 'wraps' : 'distance-fallback', lapsDone, targetLaps, accumDist: Number(accumDist.toFixed(1)), targetDist: Number(targetDist.toFixed(1)) });
            // Snap to exact start for a perfect visual stop
            try { traveled = startLen; render(traveled); } catch {}
            try { setSpeed(0); } catch {}
            pausedForQuestion = true;
            try { pause(); } catch {}
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
    if (pausedForQuestion && answeredCount >= lapCounter) {
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
    dlog('dispose');
  }

  // Initial render to place the car at the path start (with optional offset)
  render(traveled);

  return { play, pause, setSpeed, reset, dispose, setTransform, setRotation, playForLaps, setQuestionAnswered, getQuestionAnswered, setAnsweredCount, registerSpeedListener, unregisterSpeedListener };
}
