import { describe, expect, it } from "vitest";

import {
  createInstalledTeacherhelpCommand,
  resolveTeacherhelpInstallDirectory
} from "../../scripts/lib/teacherhelp-command-install-service.mjs";

describe("teacherhelp-command-install-service", () => {
  it("uses the existing npm global command directory on Windows", () => {
    expect(
      resolveTeacherhelpInstallDirectory({
        platform: "win32",
        env: {
          APPDATA: "C:\\Users\\32503\\AppData\\Roaming"
        }
      })
    ).toBe("C:\\Users\\32503\\AppData\\Roaming\\npm");
  });

  it("allows an explicit install directory override", () => {
    expect(
      resolveTeacherhelpInstallDirectory({
        platform: "win32",
        explicitDirectory: "E:\\teachhelper\\tmp\\bin",
        env: {
          APPDATA: "C:\\Users\\32503\\AppData\\Roaming"
        }
      })
    ).toBe("E:\\teachhelper\\tmp\\bin");
  });

  it("creates a command shim with an absolute path back to the project CLI", () => {
    expect(
      createInstalledTeacherhelpCommand({
        platform: "win32",
        repositoryRoot: "E:\\teachhelper"
      })
    ).toContain('node "E:\\teachhelper\\scripts\\teacherhelp-cli.mjs" %*');
  });
});
