import { describe, expect, it } from "vitest";

import { buildFreshSetupPlan } from "../../scripts/lib/fresh-setup-service.mjs";

describe("fresh setup service", () => {
  it("builds a cross-platform install, check and production-build sequence", () => {
    expect(buildFreshSetupPlan({ platform: "linux" })).toEqual([
      { command: "npm", args: ["ci"] },
      { command: "npm", args: ["run", "branding:icons"] },
      { command: "npm", args: ["run", "deploy:check"] },
      { command: "npm", args: ["run", "build"] }
    ]);
  });

  it("can install the global Windows launcher without making it the default", () => {
    expect(
      buildFreshSetupPlan({
        platform: "win32",
        installCommand: true,
        skipInstall: true,
        skipBuild: true
      })
    ).toEqual([
      { command: "npm.cmd", args: ["run", "branding:icons"] },
      { command: "npm.cmd", args: ["run", "deploy:check"] },
      { command: "npm.cmd", args: ["run", "install:teacherhelp-command"] }
    ]);
  });
});
