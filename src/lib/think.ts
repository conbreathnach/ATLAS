/**
 * Parser for reasoning-model output containing <think>…</think> blocks.
 *
 * Handles the realities of token streaming: a think block may be unclosed
 * while generating, and a tag itself may arrive split across chunks, so a
 * trailing partial tag ("<thi") is held back instead of flashing on screen.
 */

export interface ThinkSegment {
  kind: "think" | "text";
  content: string;
  /** False only while a think block is still streaming (no </think> yet). */
  closed: boolean;
}

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** Longest suffix of `text` that could grow into a full tag. */
function partialTagTail(text: string, tag: string): string {
  const max = Math.min(text.length, tag.length - 1);
  for (let length = max; length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) {
      return tag.slice(0, length);
    }
  }
  return "";
}

export function parseThinkSegments(content: string, streaming: boolean): ThinkSegment[] {
  const segments: ThinkSegment[] = [];
  let rest = content;

  while (rest.length > 0) {
    const openIndex = rest.indexOf(OPEN_TAG);
    if (openIndex === -1) {
      pushText(segments, rest, streaming);
      break;
    }
    if (openIndex > 0) {
      pushText(segments, rest.slice(0, openIndex), streaming);
    }
    rest = rest.slice(openIndex + OPEN_TAG.length);
    const closeIndex = rest.indexOf(CLOSE_TAG);
    if (closeIndex === -1) {
      let think = rest;
      if (streaming) {
        const tail = partialTagTail(think, CLOSE_TAG);
        think = think.slice(0, think.length - tail.length);
      }
      if (think.length > 0 || segments.length === 0) {
        segments.push({ kind: "think", content: think, closed: false });
      }
      rest = "";
    } else {
      segments.push({ kind: "think", content: rest.slice(0, closeIndex), closed: true });
      rest = rest.slice(closeIndex + CLOSE_TAG.length);
    }
  }
  return segments;
}

function pushText(segments: ThinkSegment[], text: string, streaming: boolean): void {
  let visible = text;
  if (streaming) {
    const tail = partialTagTail(visible, OPEN_TAG);
    visible = visible.slice(0, visible.length - tail.length);
  }
  if (visible.length > 0) {
    segments.push({ kind: "text", content: visible, closed: true });
  }
}

/** True when the entire visible output is one open think block (still reasoning). */
export function isOnlyThinking(segments: ThinkSegment[]): boolean {
  return (
    segments.length > 0 &&
    segments.every((segment) => segment.kind === "think") &&
    segments.some((segment) => !segment.closed)
  );
}
