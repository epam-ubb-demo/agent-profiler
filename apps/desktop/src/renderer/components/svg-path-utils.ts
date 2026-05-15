/**
 * Shared SVG path utilities for hand-crafted charts.
 *
 * Provides monotone cubic Bézier interpolation (Fritsch–Carlson)
 * for smooth, overshoot-free chart curves.
 */

/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 * Produces a smooth SVG path that never overshoots between data points.
 */
export function smoothPath(pts: ReadonlyArray<{ x: number; y: number }>): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  if (n === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`;

  // 1. Compute slopes of secant lines between consecutive points
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = []; // secant slopes
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]!.x - pts[i]!.x);
    dy.push(pts[i + 1]!.y - pts[i]!.y);
    m.push(dx[i]! === 0 ? 0 : dy[i]! / dx[i]!);
  }

  // 2. Compute tangent slopes at each point (Fritsch–Carlson)
  const tangent: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) {
      tangent.push(0);
    } else {
      tangent.push(3 * (dx[i - 1]! + dx[i]!) / ((2 * dx[i]! + dx[i - 1]!) / m[i - 1]! + (dx[i - 1]! + 2 * dx[i]!) / m[i]!));
    }
  }
  tangent.push(m[n - 2]!);

  // 3. Build cubic Bézier path
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i]! / 3;
    const cp1x = pts[i]!.x + seg;
    const cp1y = pts[i]!.y + tangent[i]! * seg;
    const cp2x = pts[i + 1]!.x - seg;
    const cp2y = pts[i + 1]!.y - tangent[i + 1]! * seg;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${pts[i + 1]!.x},${pts[i + 1]!.y}`;
  }
  return d;
}

/**
 * Returns only the continuation portion (no leading M) of a smooth path
 * traversing the points in reverse — used for the bottom edge of closed areas.
 */
export function smoothPathReverse(pts: ReadonlyArray<{ x: number; y: number }>): string {
  if (pts.length <= 1) return '';
  const reversed = [...pts].reverse();
  const full = smoothPath(reversed);
  // Strip the leading "Mx,y " — the caller already has a cursor position
  return full.replace(/^M[\d.eE+-]+,[\d.eE+-]+\s*/, '').replace(/^C/, ' C');
}
