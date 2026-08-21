import { describe, expect, it } from "vitest";

import {
  buildDeploymentReadinessReport,
  isSupportedNodeVersion
} from "../../scripts/lib/deployment-readiness-service.mjs";

describe("deployment readiness service", () => {
  it.each(["v20.19.0", "v22.19.0", "24.0.0"])(
    "accepts a supported Node runtime: %s",
    (version) => {
      expect(isSupportedNodeVersion(version)).toBe(true);
    }
  );

  it.each(["v18.20.0", "v20.18.9", "v25.0.0", "invalid"])(
    "rejects an unsupported Node runtime: %s",
    (version) => {
      expect(isSupportedNodeVersion(version)).toBe(false);
    }
  );

  it("reports one deployable direct-API environment without exposing values", () => {
    const report = buildDeploymentReadinessReport({
      nodeVersion: "v22.19.0",
      packageVersion: "1.0.0",
      platform: "win32",
      missingRequiredFiles: [],
      dataRootWritable: true,
      hasCodexConfig: false,
      hasCodexAuth: false,
      environment: {
        TEACHHELPER_PUBLIC_ORIGIN: "https://library.example.com",
        TEACHHELPER_AI_PROVIDER: "openai-compatible",
        TEACHHELPER_AI_BASE_URL: "https://gateway.example.com/v1",
        TEACHHELPER_AI_MODEL: "model-name",
        TEACHHELPER_AI_API_KEY: "secret-must-never-appear"
      }
    });

    expect(report.status).toBe("ready");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "node", status: "pass" }),
        expect.objectContaining({ id: "release", status: "pass" }),
        expect.objectContaining({ id: "public_origin", status: "pass" }),
        expect.objectContaining({ id: "ai", status: "pass" })
      ])
    );
    expect(JSON.stringify(report)).not.toContain("secret-must-never-appear");
    expect(JSON.stringify(report)).not.toContain("gateway.example.com");
  });

  it("keeps optional domain and AI configuration as warnings", () => {
    const report = buildDeploymentReadinessReport({
      nodeVersion: "v22.19.0",
      packageVersion: "1.0.0",
      platform: "linux",
      missingRequiredFiles: [],
      dataRootWritable: true,
      hasCodexConfig: false,
      hasCodexAuth: false,
      environment: {}
    });

    expect(report.status).toBe("ready");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "public_origin", status: "warn" }),
        expect.objectContaining({ id: "ai", status: "warn" })
      ])
    );
  });

  it("blocks an incompatible runtime, incomplete checkout or unwritable data root", () => {
    const report = buildDeploymentReadinessReport({
      nodeVersion: "v18.20.0",
      packageVersion: "0.1.0",
      platform: "linux",
      missingRequiredFiles: ["branding/teachhelper-icon-source.png"],
      dataRootWritable: false,
      hasCodexConfig: false,
      hasCodexAuth: false,
      environment: {
        TEACHHELPER_PUBLIC_ORIGIN: "https://example.com/subpath"
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.filter((check) => check.status === "fail").map((check) => check.id)).toEqual(
      ["node", "release", "files", "data_root", "public_origin"]
    );
  });
});
