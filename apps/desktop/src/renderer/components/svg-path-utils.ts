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

/**
 * Reverse an SVG path produced by smoothPath() so it traces the same curve
 * backwards.  Returns only the continuation portion (no leading M) so the
 * caller can append it to an existing sub-path.
 *
 * Only handles the `M…C…C…` output of smoothPath(). For n ≤ 2 points
 * (where smoothPath outputs M…L…), the reversal is a simple L command.
 */
export function reversePathCommands(pathStr: string): string {
  if (!pathStr) return '';

  // Parse the M command to get the starting point
  const mMatch = pathStr.match(/^M([\d.eE+-]+),([\d.eE+-]+)/);
  if (!mMatch) return '';
  const startX = mMatch[1]!;
  const startY = mMatch[2]!;

  // Parse all C commands: each has 3 coordinate pairs (cp1, cp2, end)
  const cRegex = /C([\d.eE+-]+),([\d.eE+-]+)\s+([\d.eE+-]+),([\d.eE+-]+)\s+([\d.eE+-]+),([\d.eE+-]+)/g;
  const segments: Array<{
    cp1x: string; cp1y: string;
    cp2x: string; cp2y: string;
    endX: string; endY: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = cRegex.exec(pathStr)) !== null) {
    segments.push({
      cp1x: match[1]!, cp1y: match[2]!,
      cp2x: match[3]!, cp2y: match[4]!,
      endX: match[5]!, endY: match[6]!,
    });
  }

  if (segments.length === 0) {
    // smoothPath with 2 points produces M…L… — just return L to start
    return ` L${startX},${startY}`;
  }

  // Reverse: iterate segments backwards, swap cp1↔cp2, and adjust endpoints.
  // For segment i (from pointI to pointI+1 via cp1, cp2):
  //   reversed = from pointI+1 to pointI via cp2, cp1
  let d = '';
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!;
    // The "start" of the original segment i is:
    //   - segments[i-1].end for i > 0
    //   - the M point for i === 0
    const prevX = i > 0 ? segments[i - 1]!.endX : startX;
    const prevY = i > 0 ? segments[i - 1]!.endY : startY;
    d += ` C${seg.cp2x},${seg.cp2y} ${seg.cp1x},${seg.cp1y} ${prevX},${prevY}`;
  }

  return d;
}
