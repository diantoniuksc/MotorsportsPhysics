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

  // Keep width/height for centering
  const carW = Number(car.getAttribute('width') || 48);
  const carH = Number(car.getAttribute('height') || 28);

  const total = path.getTotalLength();

  function step(ts) {
    if (!playing) return;
    if (!startTime) startTime = ts;
    const dt = (ts - startTime) / 1000; // s
    startTime = ts;
    traveled = (traveled + pxPerSec * dt) % total;
    render(traveled);
    rafId = requestAnimationFrame(step);
  }

  function render(len) {
    // position
    const p = path.getPointAtLength(len);
    // compute tangent for rotation using a small delta
    const delta = 0.5;
    const p2 = path.getPointAtLength((len + delta) % total);
    const angle = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI;

    // Center the car on the point and rotate around its center
    const x = p.x - carW / 2;
    const y = p.y - carH / 2;
    car.setAttribute('x', x.toFixed(2));
    car.setAttribute('y', y.toFixed(2));
    car.setAttribute('transform', `rotate(${angle.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
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
  function dispose() {
    pause();
  }

  // Initial render to place the car at the path start
  render(0);

  return { play, pause, setSpeed, reset, dispose };
}
