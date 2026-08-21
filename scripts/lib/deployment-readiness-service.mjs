const EXPECTED_RELEASE_VERSION = "1.0.0";
const DIRECT_AI_PROVIDERS = new Set([
  "api",
  "openai",
  "openai-compatible",
  "openai_compatible"
]);

function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(version?.trim() ?? "");

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function isSupportedNodeVersion(version) {
  const parsed = parseNodeVersion(version);

  if (!parsed || parsed.major < 20 || parsed.major >= 25) {
    return false;
  }

  return parsed.major > 20 || parsed.minor >= 19;
}

function hasValidPublicOrigin(value) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function hasDirectAiConfig(environment) {
  const provider = environment.TEACHHELPER_AI_PROVIDER?.trim().toLowerCase() ?? "";
  const baseUrl = environment.TEACHHELPER_AI_BASE_URL || environment.OPENAI_BASE_URL;
  const model = environment.TEACHHELPER_AI_MODEL || environment.OPENAI_MODEL;
  const apiKey = environment.TEACHHELPER_AI_API_KEY || environment.OPENAI_API_KEY;

  return DIRECT_AI_PROVIDERS.has(provider) && Boolean(baseUrl && model && apiKey);
}

function hasLocalCodexConfig(input) {
  const provider = input.environment.TEACHHELPER_AI_PROVIDER?.trim().toLowerCase() ?? "";

  return (
    ["ccswitch", "cc-switch", "codex"].includes(provider) &&
    input.hasCodexConfig &&
    input.hasCodexAuth
  );
}

export function buildDeploymentReadinessReport(input) {
  const checks = [];
  const addCheck = (id, status, message) => {
    checks.push({ id, status, message });
  };

  addCheck(
    "node",
    isSupportedNodeVersion(input.nodeVersion) ? "pass" : "fail",
    isSupportedNodeVersion(input.nodeVersion)
      ? "Node runtime is supported."
      : "Use Node.js 20.19 through 24.x; Node.js 22 LTS is recommended."
  );
  addCheck(
    "release",
    input.packageVersion === EXPECTED_RELEASE_VERSION ? "pass" : "fail",
    input.packageVersion === EXPECTED_RELEASE_VERSION
      ? `Release metadata is ${EXPECTED_RELEASE_VERSION}.`
      : `Expected release metadata ${EXPECTED_RELEASE_VERSION}.`
  );
  addCheck(
    "files",
    input.missingRequiredFiles.length === 0 ? "pass" : "fail",
    input.missingRequiredFiles.length === 0
      ? "Required deployment files are present."
      : `Required deployment files are missing (${input.missingRequiredFiles.length}).`
  );
  addCheck(
    "data_root",
    input.dataRootWritable ? "pass" : "fail",
    input.dataRootWritable
      ? "The persistent data root is writable."
      : "The persistent data root is not writable."
  );

  const publicOriginState = hasValidPublicOrigin(
    input.environment.TEACHHELPER_PUBLIC_ORIGIN
  );
  addCheck(
    "public_origin",
    publicOriginState === null ? "warn" : publicOriginState ? "pass" : "fail",
    publicOriginState === null
      ? "No public origin is configured; local deployment remains available."
      : publicOriginState
        ? "The public origin is valid."
        : "TEACHHELPER_PUBLIC_ORIGIN must be one root http or https origin."
  );

  const aiConfigured = hasDirectAiConfig(input.environment) || hasLocalCodexConfig(input);
  addCheck(
    "ai",
    aiConfigured ? "pass" : "warn",
    aiConfigured
      ? "An AI provider is configured."
      : "No complete AI provider configuration was detected; document AI actions will be unavailable."
  );

  return {
    status: checks.some((check) => check.status === "fail") ? "blocked" : "ready",
    version: EXPECTED_RELEASE_VERSION,
    runtime: {
      node: input.nodeVersion,
      platform: input.platform
    },
    checks
  };
}
