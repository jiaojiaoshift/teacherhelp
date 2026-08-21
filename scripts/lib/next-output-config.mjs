export function resolveNextOutputConfig(environment = process.env) {
  if (environment.TEACHHELPER_DESKTOP_BUILD === "1") {
    return {
      output: "standalone",
      distDir: environment.TEACHHELPER_NEXT_DIST_DIR || ".next-desktop"
    };
  }

  if (environment.TEACHHELPER_STANDALONE_BUILD === "1") {
    return {
      output: "standalone"
    };
  }

  return {};
}
