export function buildAndroidMaintenanceWorkflow() {
  return {
    baselineCommand: "npm.cmd run status:android",
    development: {
      line: "native_compose",
      label: "Native Android / Kotlin / Compose",
      commands: ["npm.cmd run android:dev:test", "npm.cmd run android:dev:build"]
    },
    installArtifact: {
      line: "expo_react_native",
      label: "Expo / React Native release APK",
      path: "android-app/android/app/build/outputs/apk/release/app-release.apk"
    },
    supportingCommands: {
      boundaries: "npm.cmd run android:boundaries",
      contract: "npm.cmd run verify:android-contract",
      expoTypecheck: "npm.cmd run android:expo:typecheck"
    }
  };
}

export function formatAndroidMaintenanceWorkflowGuide() {
  const workflow = buildAndroidMaintenanceWorkflow();

  return [
    "Android Maintenance Workflow",
    `Baseline Check: ${workflow.baselineCommand}`,
    `Development Line: ${workflow.development.label}`,
    "Development Commands:",
    ...workflow.development.commands.map((command) => `- ${command}`),
    `Boundary Guide: ${workflow.supportingCommands.boundaries}`,
    `Supporting Contract Check: ${workflow.supportingCommands.contract}`,
    `Expo Support Check: ${workflow.supportingCommands.expoTypecheck}`,
    `Install Artifact: ${workflow.installArtifact.label}`,
    `Install Path: ${workflow.installArtifact.path}`
  ].join("\n");
}
