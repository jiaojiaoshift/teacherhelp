export function buildFreshSetupPlan(options = {}) {
  const platform = options.platform ?? process.platform;
  const command = platform === "win32" ? "npm.cmd" : "npm";
  const plan = [];

  if (!options.skipInstall) {
    plan.push({ command, args: ["ci"] });
  }

  plan.push(
    { command, args: ["run", "branding:icons"] },
    { command, args: ["run", "deploy:check"] }
  );

  if (!options.skipBuild) {
    plan.push({ command, args: ["run", "build"] });
  }

  if (platform === "win32" && options.installCommand) {
    plan.push({ command, args: ["run", "install:teacherhelp-command"] });
  }

  return plan;
}
