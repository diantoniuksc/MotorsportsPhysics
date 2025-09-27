// Simple SVG path-following animation for Blazor
// Exports init(svgEl, { speed }) which returns an object with play/pause/setSpeed/reset/dispose

/**
 * @param {SVGSVGElement} svgEl - The SVG root containing #racePath and #carSprite
 * @param {{speed?: number}} opts
 */
export function init(svgEl, opts = {}) {
  const speed = opts.speed ?? 140; // px / s along path length
  const path = /** @type {SVGPathElement} */ (svgEl.querySelector('#racePath'));
  const car = /** @type {SVGImageElement} */ (svgEl.querySelector('#carSprite'));
  if (!path || !car) throw new Error('Missing #racePath or #carSprite in SVG');

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

  // Keep width/height for centering
  const carW = Number(car.getAttribute('width') || 48);
  const carH = Number(car.getAttribute('height') || 28);

  const total = path.getTotalLength();

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

  function render(len) {
    // position in path local coordinates
    const p = path.getPointAtLength(len);
    // compute tangent for rotation using a small delta
  const delta = 0.1; // smaller delta yields a smoother tangent estimate
  // when moving backwards use a point behind the current length so the car faces the direction of motion
  const p2 = path.getPointAtLength((len - delta + total) % total);

    // Apply the same transform (translate + scale) to map from path coordinates to SVG coords
    const mappedX = p.x * s + tx;
    const mappedY = p.y * s + ty;
    const mappedPx2X = p2.x * s + tx;
    const mappedPx2Y = p2.y * s + ty;
  const targetAngleDeg = Math.atan2(mappedPx2Y - mappedY, mappedPx2X - mappedX) * 180 / Math.PI;
  // Smooth heading change using shortest-arc interpolation
  if (prevAngleDeg === undefined) prevAngleDeg = targetAngleDeg;
  const diff = ((((targetAngleDeg - prevAngleDeg) + 540) % 360) - 180); // [-180,180)
  const smoothedAngleDeg = prevAngleDeg + diff * angleAlpha;
  prevAngleDeg = smoothedAngleDeg;
  const finalAngle = smoothedAngleDeg + rotationOffset;

    // Center the car on the mapped point and rotate around its mapped center
    const x = mappedX - carW / 2;
    const y = mappedY - carH / 2;
    car.setAttribute('x', x.toFixed(2));
    car.setAttribute('y', y.toFixed(2));
    car.setAttribute('transform', `rotate(${finalAngle.toFixed(2)} ${mappedX.toFixed(2)} ${mappedY.toFixed(2)})`);
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
    render(traveled);
  }
  function setSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    pxPerSec = Math.max(1, n);
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

  // Initial render to place the car at the path start
  render(0);

  return { play, pause, setSpeed, reset, dispose, setTransform, setRotation };
}
