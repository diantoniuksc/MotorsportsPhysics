// Simple SVG path-following animation for Blazor
// Exports init(svgEl, { speed }) which returns an object with play/pause/setSpeed/reset/dispose

/**
 * @param {SVGSVGElement} svgEl - The SVG root containing #racePath and car sprites (.carSprite or #carSprite)
 * @param {{speed?: number, startRotation?: number, angleSmoothing?: number}} opts
 */
export function init(svgEl, opts = {}) {
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

  // transform applied to the path (applied as an SVG transform on the path element)
  let tx = 0, ty = 0, s = 1;
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
    rafId = requestAnimationFrame(step);
  }
  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
  }
  function reset() {
    pause();
    traveled = 0;
    if (startOffsetFrac !== 0) {
      traveled = (traveled + startOffsetFrac * total) % total;
      if (traveled < 0) traveled += total;
    }
    render(traveled);
  }
  function setSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    // Allow 0 to keep the car stationary; negative values treated as 0
    pxPerSec = Math.max(0, n);
  }
  function setTransform(txNew, tyNew, sNew) {
    tx = Number(txNew) || 0;
    ty = Number(tyNew) || 0;
    s = Number(sNew) || 1;
    // apply to path element so the visible guide moves
    path.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
    // re-render current position so the car updates immediately
    render(traveled);
  }
  function setRotation(deg) {
    rotationOffset = Number(deg) || 0;
    // re-render so change takes effect immediately
    render(traveled);
  }
  function dispose() {
    pause();
  }

  // Initial render to place the car at the path start (with optional offset)
  render(traveled);

  return { play, pause, setSpeed, reset, dispose, setTransform, setRotation };
}
