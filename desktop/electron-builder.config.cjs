module.exports = {
  appId: "com.teachhelper.desktop",
  productName: "TeachHelper",
  asar: true,
  beforeBuild: () => false,
  directories: {
    output: "dist-desktop",
    buildResources: "desktop/resources"
  },
  files: [
    "desktop/main.cjs",
    "desktop/preload.cjs",
    "desktop/backend-runtime.mjs",
    "desktop/electron-policy.mjs",
    "package.json"
  ],
  extraResources: [
    {
      from: ".next-desktop",
      to: "backend",
      filter: ["standalone/**/*"]
    },
    {
      from: "desktop/resources/icon.png",
      to: "app-icon.png"
    }
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "desktop/resources/icon.png",
    artifactName: "TeachHelper-Setup-${version}-${arch}.${ext}"
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "TeachHelper",
    deleteAppDataOnUninstall: false,
    runAfterFinish: true
  },
  publish: []
};
