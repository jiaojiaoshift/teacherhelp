import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("server native canvas bundling", () => {
  it("keeps the native canvas package as a statically imported server external", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const nextConfig = readProjectFile("next.config.mjs");
    const canvasFactory = readProjectFile("lib/server/node-pdf-canvas-factory.ts");
    const answerStage = readProjectFile("lib/server/durable-answer-stage-service.ts");
    const browserReachablePendingConsumer = readProjectFile(
      "lib/services/mobile-upload-pending-upload-consumer-service.ts"
    );

    expect(packageJson.dependencies?.["@napi-rs/canvas"]).toBeTruthy();
    expect(nextConfig).toMatch(
      /serverComponentsExternalPackages\s*:\s*\[[^\]]*["']@napi-rs\/canvas["']/s
    );

    for (const source of [canvasFactory, answerStage]) {
      expect(source).toMatch(/from\s+["']@napi-rs\/canvas["']/);
      expect(source).not.toContain("__non_webpack_require__");
      expect(source).not.toContain("createRequire");
    }

    expect(browserReachablePendingConsumer).not.toContain(
      "@/lib/server/node-ai-image-preview-service"
    );
    expect(browserReachablePendingConsumer).toContain("preparePreviewBlob");

    expect(canvasFactory).toContain("pdfjs-dist/build/pdf.worker.mjs");
    expect(canvasFactory).toContain("pdfjsWorker");
  });
});
