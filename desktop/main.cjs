const { randomBytes } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell
} = require("electron");

const projectRoot = path.resolve(__dirname, "..");
let backendRuntime = null;
let mainWindow = null;
let desktopContext = null;
let allowQuit = false;
let shutdownPromise = null;
const isSmokeTest = process.argv.includes("--smoke-test");

function isExternalWebUrl(targetUrl) {
  try {
    const protocol = new URL(targetUrl).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function openExternalUrl(targetUrl) {
  if (isExternalWebUrl(targetUrl)) {
    void shell.openExternal(targetUrl);
  }
}

async function createApplicationWindow() {
  if (!desktopContext || mainWindow) {
    return mainWindow;
  }

  const { applicationUrl, policy } = desktopContext;
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-icon.png")
    : path.join(projectRoot, "desktop", "resources", "icon.png");
  const window = new BrowserWindow(
    policy.buildTeachHelperWindowOptions({
      preloadPath: path.join(__dirname, "preload.cjs"),
      iconPath
    })
  );

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (
      !policy.isAllowedDesktopNavigation({
        applicationUrl,
        targetUrl
      })
    ) {
      event.preventDefault();
      openExternalUrl(targetUrl);
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;
  await window.loadURL(applicationUrl);
  return window;
}

async function runElectronSmokeTest(window) {
  const outputDirectory = path.resolve(
    process.env.TEACHHELPER_DESKTOP_SMOKE_OUTPUT ||
      path.join(desktopContext.dataRoot, "temp", "electron-smoke")
  );
  await mkdir(outputDirectory, { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 750));
  const uiState = await window.webContents.executeJavaScript(`({
    title: document.title,
    theme: document.documentElement.dataset.theme || null,
    stylesheetCount: document.styleSheets.length,
    bodyTextLength: document.body.innerText.length,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  })`);
  const screenshotPath = path.join(outputDirectory, "electron-window.png");
  const screenshot = await window.webContents.capturePage();
  await writeFile(screenshotPath, screenshot.toPNG());
  await writeFile(
    path.join(outputDirectory, "result.json"),
    `${JSON.stringify(
      {
        status: "ok",
        url: window.webContents.getURL(),
        screenshotPath,
        ...uiState
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function bootstrapDesktop() {
  const [backend, policy] = await Promise.all([
    import("./backend-runtime.mjs"),
    import("./electron-policy.mjs")
  ]);
  const dataRoot = policy.resolveElectronDataRoot({
    platform: process.platform,
    environment: process.env,
    homeDirectory: app.getPath("home")
  });

  app.setPath("userData", path.join(dataRoot, "electron-profile"));

  if (!app.requestSingleInstanceLock()) {
    allowQuit = true;
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      void createApplicationWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  await app.whenReady();
  Menu.setApplicationMenu(null);

  const port = await backend.resolvePersistentLoopbackPort({ dataRoot });
  const sessionToken = randomBytes(32).toString("hex");
  const legacyLibraryPath =
    process.env.TEACHHELPER_LEGACY_LIBRARY_PATH?.trim() ||
    (!app.isPackaged ? path.join(projectRoot, "data", "library") : null);
  const backendEnvironment = policy.buildDesktopBackendEnvironment({
    ...process.env,
    ...(legacyLibraryPath
      ? { TEACHHELPER_LEGACY_LIBRARY_PATH: legacyLibraryPath }
      : {})
  });
  const launchPlan = backend.buildStandaloneBackendLaunchPlan({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    executablePath: process.execPath,
    dataRoot,
    port,
    sessionToken,
    environment: backendEnvironment
  });

  backendRuntime = await backend.startStandaloneBackend({ launchPlan });
  await backend.runDesktopLibraryMigration({
    baseUrl: backendRuntime.url,
    sessionToken
  });
  await session.defaultSession.cookies.set(
    policy.buildDesktopSessionCookie({
      applicationUrl: backendRuntime.url,
      sessionToken
    })
  );

  desktopContext = {
    applicationUrl: backendRuntime.url,
    dataRoot,
    policy,
    sessionToken
  };

  app.on("activate", () => {
    if (!mainWindow) {
      void createApplicationWindow();
    }
  });

  const window = await createApplicationWindow();

  if (isSmokeTest && window) {
    await runElectronSmokeTest(window);
    app.quit();
  }
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (allowQuit || !backendRuntime) {
    return;
  }

  event.preventDefault();
  shutdownPromise ??= backendRuntime.stop().finally(() => {
    backendRuntime = null;
    allowQuit = true;
    app.quit();
  });
});

void bootstrapDesktop().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown desktop startup error";
  dialog.showErrorBox("TeachHelper 启动失败", message);
  app.quit();
});
