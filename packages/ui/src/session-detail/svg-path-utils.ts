/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 * Produces a smooth SVG path that never overshoots between data points.
 */
export function smoothPath(pts: ReadonlyArray<{ x: number; y: number }>): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  if (n === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`;

  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]!.x - pts[i]!.x);
    dy.push(pts[i + 1]!.y - pts[i]!.y);
    m.push(dx[i]! === 0 ? 0 : dy[i]! / dx[i]!);
  }

  const tangent: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) {
      tangent.push(0);
    } else {
      tangent.push(3 * (dx[i - 1]! + dx[i]!) / ((2 * dx[i]! + dx[i - 1]!) / m[i - 1]! + (dx[i - 1]! + 2 * dx[i]!) / m[i]!));
    }
  }
  tangent.push(m[n - 2]!);

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
