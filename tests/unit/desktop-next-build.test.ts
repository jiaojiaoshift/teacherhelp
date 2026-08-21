import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDesktopNextEnvironment,
  prepareDesktopStandaloneResources,
  resolveDesktopStandalonePaths
} from "../../scripts/lib/desktop-next-build-service.mjs";

const temporaryDirectories: string[] = [];

function loadNextConfig(environment: NodeJS.ProcessEnv) {
  const configUrl = pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href;
  const source = `const value = (await import(${JSON.stringify(configUrl)})).default; process.stdout.write(JSON.stringify(value));`;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: process.cwd(),
      env: environment,
      encoding: "utf8"
    })
  ) as { output?: string; distDir?: string };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("desktop Next standalone build", () => {
  it("keeps ordinary production builds on the existing .next output", () => {
    const environment = { ...process.env };
    delete environment.TEACHHELPER_DESKTOP_BUILD;
    delete environment.TEACHHELPER_NEXT_DIST_DIR;

    const config = loadNextConfig(environment);

    expect(config.output).toBeUndefined();
    expect(config.distDir).toBeUndefined();
  });

  it("uses standalone output and an isolated dist directory for desktop builds", () => {
    const config = loadNextConfig({
      ...process.env,
      TEACHHELPER_DESKTOP_BUILD: "1",
      TEACHHELPER_NEXT_DIST_DIR: ".next-desktop"
    });

    expect(config.output).toBe("standalone");
    expect(config.distDir).toBe(".next-desktop");
  });

  it("builds a deterministic desktop environment without changing unrelated values", () => {
    expect(
      buildDesktopNextEnvironment({
        environment: { NODE_ENV: "production", CUSTOM_VALUE: "kept" }
      })
    ).toMatchObject({
      NODE_ENV: "production",
      CUSTOM_VALUE: "kept",
      TEACHHELPER_DESKTOP_BUILD: "1",
      TEACHHELPER_NEXT_DIST_DIR: ".next-desktop"
    });
  });

  it("copies public and static assets into the standalone server root", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "teachhelper-desktop-next-"));
    temporaryDirectories.push(projectRoot);
    const paths = resolveDesktopStandalonePaths(projectRoot);
    expect(paths.staticTarget).toBe(
      path.join(paths.standaloneRoot, ".next-desktop", "static")
    );
    await mkdir(paths.standaloneRoot, { recursive: true });
    await mkdir(paths.staticSource, { recursive: true });
    await mkdir(paths.publicSource, { recursive: true });
    await writeFile(path.join(paths.standaloneRoot, "server.js"), "// server\n", "utf8");
    await writeFile(path.join(paths.staticSource, "app.css"), "body{}\n", "utf8");
    await writeFile(path.join(paths.publicSource, "icon.png"), "icon", "utf8");

    await prepareDesktopStandaloneResources({ projectRoot });

    expect(await readFile(path.join(paths.staticTarget, "app.css"), "utf8")).toBe(
      "body{}\n"
    );
    expect(await readFile(path.join(paths.publicTarget, "icon.png"), "utf8")).toBe("icon");
    expect(await readFile(paths.serverEntry, "utf8")).toBe("// server\n");
  });
});
