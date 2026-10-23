/**
 * Repairs a common model mistake: fenced code blocks that contain same-length
 * fences (e.g. a ```markdown template holding ```bash examples). CommonMark
 * closes the outer block at the first bare inner fence, scrambling the rest.
 *
 * Strategy: track fence depth. A fence line WITH an info string opens a level;
 * a bare fence line closes one. When the outermost block closes, if any inner
 * fence was at least as long as the outer opener, rewrite the outer opener and
 * its closer with one more marker so the inner fences stay literal content.
 */

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;

export function rebalanceFences(input: string): string {
  const lines = input.split("\n");
  let outer: { index: number; marker: string; length: number } | null = null;
  let depth = 0;
  let maxInner = 0;

  for (let index = 0; index < lines.length; index++) {
    const match = FENCE.exec(lines[index]);
    if (!match) continue;
    const [, , markers, info] = match;
    const marker = markers[0];
    const length = markers.length;
    const hasInfo = info.trim().length > 0;

    if (depth === 0) {
      outer = { index, marker, length };
      depth = 1;
      maxInner = 0;
      continue;
    }
    if (marker !== outer?.marker) continue; // other marker type is literal content

    if (hasInfo) {
      depth += 1;
      maxInner = Math.max(maxInner, length);
      continue;
    }
    depth -= 1;
    if (depth === 0 && outer) {
      const needed = maxInner + 1;
      if (outer.length <= maxInner) {
        lines[outer.index] = lines[outer.index].replace(/`{3,}|~{3,}/, (run) =>
          run[0].repeat(Math.max(run.length, needed)),
        );
        lines[index] = lines[index].replace(/`{3,}|~{3,}/, outer.marker.repeat(needed));
      }
      outer = null;
    }
  }
  return lines.join("\n");
}
