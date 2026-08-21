import path from "node:path";

export interface TeachHelperStoragePaths {
  dataRoot: string;
  libraryDirectory: string;
  tasksDirectory: string;
  backupsDirectory: string;
  logsDirectory: string;
  tempDirectory: string;
  mobileUploadStateFile: string;
  settingsFile: string;
}

interface ResolveStoragePathsOptions {
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
}

interface ResolveDesktopDataRootOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  homeDirectory: string;
}

function resolveOptionalPath(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? path.resolve(normalized) : null;
}

export function resolveDefaultDesktopDataRoot(
  options: ResolveDesktopDataRootOptions
): string {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;

  if (platform === "win32") {
    const localAppData = resolveOptionalPath(environment.LOCALAPPDATA);
    return path.join(
      localAppData ?? path.join(path.resolve(options.homeDirectory), "AppData", "Local"),
      "TeachHelper"
    );
  }

  if (platform === "darwin") {
    return path.join(path.resolve(options.homeDirectory), "Library", "Application Support", "TeachHelper");
  }

  return path.join(
    resolveOptionalPath(environment.XDG_DATA_HOME) ??
      path.join(path.resolve(options.homeDirectory), ".local", "share"),
    "TeachHelper"
  );
}

export function resolveTeachHelperStoragePaths(
  options: ResolveStoragePathsOptions = {}
): TeachHelperStoragePaths {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environment = options.environment ?? process.env;
  const explicitDataRoot = resolveOptionalPath(environment.TEACHHELPER_DATA_ROOT);
  const dataRoot = explicitDataRoot ?? path.join(cwd, "data");
  const tasksDirectory = path.join(dataRoot, "tasks");
  const tempDirectory = explicitDataRoot ? path.join(dataRoot, "temp") : path.join(cwd, "tmp");

  return {
    dataRoot,
    libraryDirectory:
      resolveOptionalPath(environment.TEACHHELPER_LOCAL_LIBRARY_PATH) ??
      path.join(dataRoot, "library"),
    tasksDirectory,
    backupsDirectory: explicitDataRoot
      ? path.join(dataRoot, "backups")
      : path.join(dataRoot, "library-backups"),
    logsDirectory: explicitDataRoot ? path.join(dataRoot, "logs") : path.join(cwd, "logs"),
    tempDirectory,
    mobileUploadStateFile:
      resolveOptionalPath(environment.TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH) ??
      (explicitDataRoot
        ? path.join(tasksDirectory, "mobile-upload-helper-state.json")
        : path.join(tempDirectory, "mobile-upload-helper-state.json")),
    settingsFile: path.join(dataRoot, "settings.json")
  };
}
