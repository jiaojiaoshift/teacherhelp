import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("dark theme configuration", () => {
  it("marks the document as dark and defines neutral workspace surfaces", () => {
    const layout = readFileSync(path.join(process.cwd(), "app", "layout.tsx"), "utf8");
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

    expect(layout).toContain('<html data-theme="dark" lang="zh-CN">');
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("--paper: #080b10");
    expect(css).toContain("--panel: #111820");
    expect(css).toContain('[data-theme="dark"] .bg-white');
    expect(css).toContain('[data-theme="dark"] .text-slate-950');
    expect(css).toContain('[data-theme="dark"] .border-slate-200');
  });

  it("keeps document imagery in its original color space", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

    expect(css).toContain('[data-theme="dark"] img');
    expect(css).toContain("filter: none");
  });
});
