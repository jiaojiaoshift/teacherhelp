const LINE_LABELS = {
  expo_react_native: "Expo / React Native",
  native_compose: "Native Android / Kotlin / Compose"
};

const VARIANT_LABELS = {
  debug: "debug APK",
  release: "release APK"
};

const SHARED_ANDROID_BRANDING_LINE = "shared_android_branding";
const INSTALL_ARTIFACT_STALE_RISK =
  "The selected install artifact is older than Android launcher icon resources; rebuild that install line before claiming the APK contains the latest branding.";

function compareArtifactsByPreference(left, right) {
  if (left.variant !== right.variant) {
    return left.variant === "release" ? -1 : 1;
  }

  return right.lastModifiedAt.localeCompare(left.lastModifiedAt);
}

function compareArtifactsByRecency(left, right) {
  return right.lastModifiedAt.localeCompare(left.lastModifiedAt);
}

function formatBytes(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "unknown size";
  }

  const sizeInMegabytes = sizeBytes / (1024 * 1024);

  return `${sizeInMegabytes.toFixed(1)} MB`;
}

function toLineLabel(line) {
  return LINE_LABELS[line] ?? line;
}

function toArtifactLabel(artifact) {
  return `${toLineLabel(artifact.line)} ${VARIANT_LABELS[artifact.variant] ?? artifact.variant}`;
}

function getPreferredInstallArtifact(artifacts) {
  if (artifacts.length === 0) {
    return null;
  }

  return [...artifacts].sort(compareArtifactsByPreference)[0];
}

function getNativeUploadContractStatus(verifications) {
  return verifications?.contract?.nativeMobileUpload ?? "not_run";
}

function getRelevantSourceAssetsForArtifact(installArtifact, sourceAssets) {
  if (!installArtifact) {
    return [];
  }

  return sourceAssets.filter(
    (sourceAsset) =>
      sourceAsset.line === installArtifact.line ||
      sourceAsset.line === SHARED_ANDROID_BRANDING_LINE
  );
}

function getInstallArtifactFreshness(installArtifact, sourceAssets) {
  if (!installArtifact) {
    return {
      status: "not_available",
      staleAssets: []
    };
  }

  const relevantAssets = getRelevantSourceAssetsForArtifact(installArtifact, sourceAssets);

  if (relevantAssets.length === 0) {
    return {
      status: "not_checked",
      staleAssets: []
    };
  }

  const staleAssets = relevantAssets.filter(
    (sourceAsset) => sourceAsset.lastModifiedAt > installArtifact.lastModifiedAt
  );

  return {
    status: staleAssets.length > 0 ? "stale" : "fresh",
    staleAssets
  };
}

function getPreferredDevelopmentLine(verifications, artifacts) {
  if (
    verifications?.native?.coreTest === "passed" &&
    verifications?.native?.assembleDebug === "passed"
  ) {
    return {
      line: "native_compose",
      reason:
        "Native line passed :core:test and :app:assembleDebug, so ongoing Android development should follow the real Gradle build path."
    };
  }

  if (verifications?.expo?.typecheck === "passed") {
    return {
      line: "expo_react_native",
      reason:
        "Expo line passed typecheck, so it is the only currently verified line available for continued maintenance."
    };
  }

  const newestArtifact = [...artifacts].sort(compareArtifactsByRecency)[0];

  if (!newestArtifact) {
    return {
      line: null,
      reason: "No verified Android command result or APK artifact is currently available."
    };
  }

  return {
    line: newestArtifact.line,
    reason: "Complete verification is missing, so the newest available APK artifact is the fallback signal."
  };
}

export function buildAndroidMaintenanceDecision(input) {
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const sourceAssets = Array.isArray(input?.sourceAssets) ? input.sourceAssets : [];
  const verifications = input?.verifications ?? {};
  const installArtifact = getPreferredInstallArtifact(artifacts);
  const installArtifactFreshness = getInstallArtifactFreshness(installArtifact, sourceAssets);
  const development = getPreferredDevelopmentLine(verifications, artifacts);
  const risks = [];

  const distinctLines = new Set(artifacts.map((artifact) => artifact.line));

  if (distinctLines.size > 1) {
    risks.push(
      "Android dual-line maintenance is still active; confirm whether the target is android-app/src or android-app/app + android-app/core before changing code."
    );
  }

  if (installArtifact && development.line && installArtifact.line !== development.line) {
    risks.push(
      "The installable APK and the recommended development line are different; keep both the install artifact and the development line explicit in future maintenance."
    );
  }

  if (getNativeUploadContractStatus(verifications) === "failed") {
    risks.push(
      "Native mobile-upload contract drift is present; keep the shared workspace contract and Kotlin upload literals aligned before further Android maintenance."
    );
  }

  if (installArtifactFreshness.status === "stale") {
    risks.push(INSTALL_ARTIFACT_STALE_RISK);
  }

  return {
    installArtifact,
    installArtifactFreshness,
    development,
    risks
  };
}

export function formatAndroidMaintenanceReport(input) {
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const sourceAssets = Array.isArray(input?.sourceAssets) ? input.sourceAssets : [];
  const verifications = input?.verifications ?? {};
  const contractVerification = input?.contractVerification ?? null;
  const decision = buildAndroidMaintenanceDecision({
    verifications,
    artifacts,
    sourceAssets
  });

  const lines = [
    "Android Maintenance Report",
    `Install Artifact: ${
      decision.installArtifact ? toArtifactLabel(decision.installArtifact) : "None"
    }`,
    decision.installArtifact ? `Install Path: ${decision.installArtifact.path}` : "Install Path: N/A",
    `Install Artifact Freshness: ${decision.installArtifactFreshness.status}`,
    `Development Line: ${
      decision.development.line ? toLineLabel(decision.development.line) : "Undecided"
    }`,
    `Development Reason: ${decision.development.reason}`,
    `Expo Typecheck: ${verifications?.expo?.typecheck ?? "not_run"}`,
    `Native :core:test: ${verifications?.native?.coreTest ?? "not_run"}`,
    `Native :app:assembleDebug: ${verifications?.native?.assembleDebug ?? "not_run"}`,
    `Native Upload Contract: ${getNativeUploadContractStatus(verifications)}`,
    "Artifacts:"
  ];

  if (artifacts.length === 0) {
    lines.push("- none");
  } else {
    for (const artifact of artifacts.sort(compareArtifactsByPreference)) {
      lines.push(
        `- ${toArtifactLabel(artifact)} | ${artifact.path} | ${formatBytes(artifact.sizeBytes)} | ${artifact.lastModifiedAt}`
      );
    }
  }

  if (decision.installArtifactFreshness.staleAssets.length > 0) {
    lines.push("Newer Source Assets:");
    for (const sourceAsset of decision.installArtifactFreshness.staleAssets) {
      lines.push(
        `- ${sourceAsset.path} | ${sourceAsset.kind} | ${sourceAsset.lastModifiedAt}`
      );
    }
  }

  if (decision.risks.length > 0) {
    lines.push("Risks:");
    for (const risk of decision.risks) {
      lines.push(`- ${risk}`);
    }
  }

  if (
    getNativeUploadContractStatus(verifications) === "failed" &&
    Array.isArray(contractVerification?.errors) &&
    contractVerification.errors.length > 0
  ) {
    lines.push("Contract Errors:");
    for (const error of contractVerification.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}
