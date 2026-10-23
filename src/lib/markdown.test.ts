import { describe, expect, it } from "vitest";
import { rebalanceFences } from "./markdown";

describe("rebalanceFences", () => {
  it("leaves normal fences untouched", () => {
    const input = "text\n```bash\nnpm install\n```\nmore";
    expect(rebalanceFences(input)).toBe(input);
  });

  it("extends an outer fence that contains same-length fences", () => {
    const input = "```markdown\n# Title\n```bash\nnpm i\n```\n```";
    const output = rebalanceFences(input);
    expect(output).toBe("````markdown\n# Title\n```bash\nnpm i\n```\n````");
  });

  it("handles multiple nested blocks", () => {
    const input = "```md\n```bash\na\n```\n```bash\nb\n```\n```";
    const output = rebalanceFences(input);
    expect(output.startsWith("````md")).toBe(true);
    expect(output.endsWith("````")).toBe(true);
    expect((output.match(/```bash/g) ?? []).length).toBe(2);
  });

  it("leaves unclosed fences alone", () => {
    const input = "```markdown\n```bash\na\n```";
    expect(rebalanceFences(input)).toBe(input);
  });

  it("keeps longer outer fences as-is", () => {
    const input = "````markdown\n```bash\na\n```\n````";
    expect(rebalanceFences(input)).toBe(input);
  });

  it("does not confuse tilde and backtick fences", () => {
    const input = "~~~markdown\n```bash\na\n```\n~~~";
    expect(rebalanceFences(input)).toBe(input);
  });
});
