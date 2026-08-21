import path from "node:path";

const DEFAULT_DESKTOP_AI_PROVIDER = "ccswitch";
const DEFAULT_DESKTOP_AI_MODEL = "gpt-5.6-sol";
const DEFAULT_DESKTOP_AI_REASONING_EFFORT = "xhigh";
const LEGACY_AI_MODEL_PATTERN = /^gpt-5\.5(?:$|[-_])/iu;

function isLegacyAiModel(value) {
  return LEGACY_AI_MODEL_PATTERN.test(value?.trim() || "");
}

function resolveDesktopAiModel(value) {
  const configuredModel = value?.trim();
  return configuredModel && !isLegacyAiModel(configuredModel)
    ? configuredModel
    : DEFAULT_DESKTOP_AI_MODEL;
}

function resolveDesktopAiReasoning(value, configuredModel) {
  const configuredReasoning = value?.trim();
  return configuredReasoning && !isLegacyAiModel(configuredModel)
    ? configuredReasoning
    : DEFAULT_DESKTOP_AI_REASONING_EFFORT;
}

function resolveOptionalPath(value) {
  const normalized = value?.trim();
  return normalized ? path.resolve(normalized) : null;
}

export function buildDesktopBackendEnvironment(environment = process.env) {
  return {
    ...environment,
    TEACHHELPER_AI_PROVIDER:
      environment.TEACHHELPER_AI_PROVIDER?.trim() || DEFAULT_DESKTOP_AI_PROVIDER,
    TEACHHELPER_AI_MODEL: resolveDesktopAiModel(environment.TEACHHELPER_AI_MODEL),
    TEACHHELPER_AI_REASONING_EFFORT: resolveDesktopAiReasoning(
      environment.TEACHHELPER_AI_REASONING_EFFORT,
      environment.TEACHHELPER_AI_MODEL
    )
  };
}

export function resolveElectronDataRoot({
  platform = process.platform,
  environment = process.env,
  homeDirectory
}) {
  const explicitRoot = resolveOptionalPath(environment.TEACHHELPER_DATA_ROOT);

  if (explicitRoot) {
    return explicitRoot;
  }

  if (platform === "win32") {
    return path.join(
      resolveOptionalPath(environment.LOCALAPPDATA) ??
        path.join(path.resolve(homeDirectory), "AppData", "Local"),
      "TeachHelper"
    );
  }

  if (platform === "darwin") {
    return path.join(path.resolve(homeDirectory), "Library", "Application Support", "TeachHelper");
  }

  return path.join(
    resolveOptionalPath(environment.XDG_DATA_HOME) ??
      path.join(path.resolve(homeDirectory), ".local", "share"),
    "TeachHelper"
  );
}

export function buildTeachHelperWindowOptions({ preloadPath, iconPath }) {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#080b10",
    autoHideMenuBar: true,
    ...(iconPath ? { icon: path.resolve(iconPath) } : {}),
    webPreferences: {
      preload: path.resolve(preloadPath),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  };
}

export function buildDesktopSessionCookie({ applicationUrl, sessionToken }) {
  const origin = new URL(applicationUrl).origin;

  return {
    url: origin,
    name: "teachhelper_desktop_session",
    value: sessionToken,
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: "/"
  };
}

export function isAllowedDesktopNavigation({ applicationUrl, targetUrl }) {
  try {
    const applicationOrigin = new URL(applicationUrl).origin;
    const target = new URL(targetUrl);
    return target.protocol === "http:" && target.origin === applicationOrigin;
  } catch {
    return false;
  }
}
