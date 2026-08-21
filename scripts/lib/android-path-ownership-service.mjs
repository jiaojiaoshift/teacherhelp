const OWNERSHIP_RULES = [
  {
    scope: "native_compose",
    label: "Native Android / Kotlin / Compose",
    patterns: ["android-app/app/", "android-app/core/"]
  },
  {
    scope: "expo_prebuild",
    label: "Expo Android prebuild output",
    patterns: ["android-app/android/"]
  },
  {
    scope: "expo_react_native",
    label: "Expo / React Native support line",
    patterns: [
      "android-app/src/",
      "android-app/App.tsx",
      "android-app/package.json",
      "android-app/tsconfig.json",
      "android-app/app.json",
      "android-app/babel.config.js"
    ]
  },
  {
    scope: "shared_android_workspace",
    label: "Shared Android workspace",
    patterns: [
      "android-app/build.gradle",
      "android-app/settings.gradle",
      "android-app/gradle.properties",
      "android-app/gradle/",
      "android-app/gradlew.bat"
    ]
  }
];

const DEFAULT_DEVELOPMENT_PATHS = ["android-app/app/**", "android-app/core/**"];
const EXPO_SUPPORT_PATHS = [
  "android-app/src/**",
  "android-app/App.tsx",
  "android-app/package.json",
  "android-app/tsconfig.json",
  "android-app/app.json",
  "android-app/babel.config.js"
];
const EXPO_PREBUILD_PATHS = ["android-app/android/**"];
const SHARED_WORKSPACE_PATHS = [
  "android-app/build.gradle",
  "android-app/settings.gradle",
  "android-app/gradle.properties",
  "android-app/gradle/**",
  "android-app/gradlew.bat"
];
const CHANGESET_WARNING =
  "Reviewed paths span multiple Android ownership scopes; confirm that this maintenance slice really needs changes across both the native dev line and the Expo-related line.";

function normalizePath(input) {
  return input.replaceAll("\\", "/");
}

function matchesPattern(path, pattern) {
  if (pattern.endsWith("/")) {
    return path.startsWith(pattern);
  }

  return path === pattern;
}

export function classifyAndroidPathOwnership(path) {
  const normalizedPath = normalizePath(path);

  for (const rule of OWNERSHIP_RULES) {
    if (rule.patterns.some((pattern) => matchesPattern(normalizedPath, pattern))) {
      return {
        path: normalizedPath,
        scope: rule.scope,
        label: rule.label
      };
    }
  }

  return {
    path: normalizedPath,
    scope: "outside_android_scope",
    label: "Outside Android maintenance scope"
  };
}

function buildAndroidOwnershipWarnings(reviewedPaths) {
  const effectiveScopes = new Set(
    reviewedPaths
      .map((reviewedPath) => reviewedPath.scope)
      .filter(
        (scope) =>
          scope !== "shared_android_workspace" && scope !== "outside_android_scope"
      )
  );

  if (effectiveScopes.size > 1) {
    return [CHANGESET_WARNING];
  }

  return [];
}

export function buildAndroidPathOwnershipGuide(reviewPaths = []) {
  const reviewedPaths = reviewPaths.map((path) => classifyAndroidPathOwnership(path));
  const warnings = buildAndroidOwnershipWarnings(reviewedPaths);

  return {
    defaultDevelopmentLine: "Native Android / Kotlin / Compose",
    defaultDevelopmentPaths: DEFAULT_DEVELOPMENT_PATHS,
    expoSupportPaths: EXPO_SUPPORT_PATHS,
    expoPrebuildPaths: EXPO_PREBUILD_PATHS,
    sharedWorkspacePaths: SHARED_WORKSPACE_PATHS,
    reviewedPaths,
    warnings,
    status: warnings.length > 0 ? "warning" : "ok",
    shouldFail: warnings.length > 0
  };
}

export function formatAndroidPathOwnershipGuide(reviewPaths = []) {
  const guide = buildAndroidPathOwnershipGuide(reviewPaths);

  const lines = [
    "Android Path Ownership",
    `Status: ${guide.status}`,
    `Default Development Line: ${guide.defaultDevelopmentLine}`,
    "Default Development Paths:",
    ...guide.defaultDevelopmentPaths.map((path) => `- ${path}`),
    "Expo Support Line:",
    ...guide.expoSupportPaths.map((path) => `- ${path}`),
    "Expo Prebuild Output:",
    ...guide.expoPrebuildPaths.map((path) => `- ${path}`),
    "Shared Workspace Paths:",
    ...guide.sharedWorkspacePaths.map((path) => `- ${path}`)
  ];

  if (guide.reviewedPaths.length > 0) {
    lines.push("Reviewed Paths:");
    for (const reviewedPath of guide.reviewedPaths) {
      lines.push(`- ${reviewedPath.path} -> ${reviewedPath.label}`);
    }
  }

  if (guide.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of guide.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}
