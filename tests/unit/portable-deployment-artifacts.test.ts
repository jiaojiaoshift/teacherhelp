import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("portable deployment artifacts", () => {
  it("exposes supported runtime and fresh-machine commands", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      engines?: Record<string, string>;
      packageManager?: string;
      scripts: Record<string, string>;
      license: string;
    };

    expect(packageJson.engines).toEqual({
      node: ">=20.19.0 <25",
      npm: ">=10"
    });
    expect(packageJson.packageManager).toBe("npm@10.9.3");
    expect(packageJson.scripts["setup:fresh"]).toBe("node ./scripts/bootstrap.mjs");
    expect(packageJson.scripts["deploy:check"]).toBe(
      "node ./scripts/check-deployment-readiness.mjs"
    );
    expect(packageJson.scripts["deploy:build"]).toBe(
      "node ./scripts/build-web-standalone.mjs"
    );
    expect(packageJson.license).toBe("GPL-3.0-only");
  });

  it("keeps deployment secrets and user data outside the container image", () => {
    const dockerIgnore = read(".dockerignore");
    const dockerfile = read("Dockerfile");
    const compose = read("docker-compose.example.yml");

    for (const ignoredPath of [
      ".env*",
      ".codex/",
      ".cc-connect/",
      "data/",
      "logs/",
      "tmp/",
      "exports/",
      "backups/",
      "node_modules/",
      "*.pdf"
    ]) {
      expect(dockerIgnore).toContain(ignoredPath);
    }

    expect(dockerfile).toContain("npm run deploy:build");
    expect(dockerfile).toContain("USER teachhelper");
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(dockerfile).toContain("/api/health");
    expect(compose).toContain("teachhelper-data:/data");
    expect(compose).toContain("TEACHHELPER_DATA_ROOT: /data");
    expect(compose).toContain("/api/health");
  });

  it("includes domain, open-source and CI guidance without tracked credentials", () => {
    for (const relativePath of [
      "README.md",
      "LICENSE",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "deploy/nginx/teachhelper.conf.example",
      ".github/workflows/ci.yml"
    ]) {
      expect(existsSync(path.join(root, relativePath)), relativePath).toBe(true);
    }

    const environmentExample = read(".env.example");
    expect(environmentExample).toContain("TEACHHELPER_PUBLIC_ORIGIN");
    expect(environmentExample).toContain("TEACHHELPER_DATA_ROOT");
    expect(environmentExample).not.toMatch(/sk-[A-Za-z0-9]{12,}/u);
    expect(read("README.md")).toContain("TEACHHELPER_PUBLIC_ORIGIN");
    expect(read("README.md")).toContain("https://vvw.wvv.pp.ua/");
    expect(read("README.md")).toContain("免责声明");
    expect(read("README.md").indexOf("https://vvw.wvv.pp.ua/")).toBeLessThan(
      read("README.md").indexOf("![TeachHelper icon]")
    );
    expect(read("README.md")).toContain("GPL-3.0-only");
    expect(read("deploy/nginx/teachhelper.conf.example")).toContain("proxy_read_timeout 900s");
    expect(read(".github/workflows/ci.yml")).toContain("matrix.os");
  });
});
