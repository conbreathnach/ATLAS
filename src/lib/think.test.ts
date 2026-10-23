import { describe, expect, it } from "vitest";
import { isOnlyThinking, parseThinkSegments } from "./think";

describe("parseThinkSegments", () => {
  it("passes plain text through untouched", () => {
    expect(parseThinkSegments("hello world", false)).toEqual([
      { kind: "text", content: "hello world", closed: true },
    ]);
  });

  it("extracts a closed think block", () => {
    expect(parseThinkSegments("<think>reasoning</think>answer", false)).toEqual([
      { kind: "think", content: "reasoning", closed: true },
      { kind: "text", content: "answer", closed: true },
    ]);
  });

  it("keeps an unclosed think block open", () => {
    expect(parseThinkSegments("<think>still going", true)).toEqual([
      { kind: "think", content: "still going", closed: false },
    ]);
  });

  it("handles multiple think blocks", () => {
    const parsed = parseThinkSegments("<think>a</think>mid<think>b</think>end", false);
    expect(parsed.map((segment) => segment.kind)).toEqual(["think", "text", "think", "text"]);
  });

  it("holds back a partial opening tag while streaming", () => {
    expect(parseThinkSegments("text<thi", true)).toEqual([
      { kind: "text", content: "text", closed: true },
    ]);
    // The held-back tail resolves once the rest arrives.
    expect(parseThinkSegments("text<think>why", true)).toEqual([
      { kind: "text", content: "text", closed: true },
      { kind: "think", content: "why", closed: false },
    ]);
  });

  it("holds back a partial closing tag inside an open think block", () => {
    expect(parseThinkSegments("<think>deep thought</th", true)).toEqual([
      { kind: "think", content: "deep thought", closed: false },
    ]);
  });

  it("does not hold back partial tags once streaming finished", () => {
    expect(parseThinkSegments("text<thi", false)).toEqual([
      { kind: "text", content: "text<thi", closed: true },
    ]);
  });

  it("emits an empty open think block for a bare opening tag", () => {
    expect(parseThinkSegments("<think>", true)).toEqual([
      { kind: "think", content: "", closed: false },
    ]);
  });

  it("treats text before the first think block as normal output", () => {
    const parsed = parseThinkSegments("note<think>x</think>", false);
    expect(parsed[0]).toEqual({ kind: "text", content: "note", closed: true });
    expect(parsed[1]).toEqual({ kind: "think", content: "x", closed: true });
  });
});

describe("isOnlyThinking", () => {
  it("is true while only an open think block exists", () => {
    expect(isOnlyThinking(parseThinkSegments("<think>hmm", true))).toBe(true);
  });

  it("is false once answer text exists", () => {
    expect(isOnlyThinking(parseThinkSegments("<think>hmm</think>answer", true))).toBe(false);
  });
});
