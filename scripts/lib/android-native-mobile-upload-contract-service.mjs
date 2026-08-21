import { readFileSync } from "node:fs";
import path from "node:path";

const RELATIVE_PATHS = {
  sharedContract: "lib/services/mobile-upload-contract.ts",
  nativeUploadKind:
    "android-app/core/src/main/kotlin/com/teachhelper/mobile/core/upload/MobileUploadKind.kt",
  nativePairingParser:
    "android-app/core/src/main/kotlin/com/teachhelper/mobile/core/pairing/PairingPayloadParser.kt",
  nativeMainActivity: "android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt"
};

function readWorkspaceSource(repositoryRoot, relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function requirePatternMatch(source, pattern, errorMessage) {
  const match = source.match(pattern);

  if (!match) {
    throw new Error(errorMessage);
  }

  return match;
}

function extractSharedPairingQrType(source) {
  const match = requirePatternMatch(
    source,
    /export const MOBILE_UPLOAD_PAIRING_QR_TYPE = "([^"]+)"/,
    "Failed to extract the shared mobile-upload pairing QR type."
  );

  return match[1];
}

function extractSharedUploadKindValues(source) {
  const match = requirePatternMatch(
    source,
    /export const MOBILE_UPLOAD_KIND_VALUES = \[(?<values>[\s\S]*?)\] as const;/,
    "Failed to extract the shared mobile-upload kind list."
  );

  return [...match.groups.values.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractNativeUploadKinds(source) {
  const entries = [
    ...source.matchAll(/^\s*([A-Z_]+)\("([^"]+)"\)/gm)
  ].map((match) => ({
    name: match[1],
    wireValue: match[2]
  }));

  if (entries.length === 0) {
    throw new Error("Failed to extract native Android upload kinds.");
  }

  return entries;
}

function extractNativePairingQrType(source) {
  const match = requirePatternMatch(
    source,
    /payload\.type\s*!=\s*"([^"]+)"/,
    "Failed to extract the native Android pairing QR type."
  );

  return match[1];
}

function extractNativeDisplayLabelKinds(source) {
  const entries = [...source.matchAll(/MobileUploadKind\.([A-Z_]+)\s*->\s*"([^"]*)"/g)].map(
    (match) => ({
      name: match[1],
      label: match[2]
    })
  );

  if (entries.length === 0) {
    throw new Error("Failed to extract native Android upload-kind display labels.");
  }

  return entries;
}

function areOrderedListsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function formatOrderedList(values) {
  return values.join(", ");
}

export function collectSharedMobileUploadContract({ repositoryRoot }) {
  const sharedContractSource = readWorkspaceSource(repositoryRoot, RELATIVE_PATHS.sharedContract);

  return {
    sourceFiles: {
      sharedContract: RELATIVE_PATHS.sharedContract
    },
    pairingQrType: extractSharedPairingQrType(sharedContractSource),
    uploadKindValues: extractSharedUploadKindValues(sharedContractSource)
  };
}

export function collectNativeAndroidMobileUploadContract({ repositoryRoot }) {
  const uploadKindSource = readWorkspaceSource(repositoryRoot, RELATIVE_PATHS.nativeUploadKind);
  const pairingParserSource = readWorkspaceSource(repositoryRoot, RELATIVE_PATHS.nativePairingParser);
  const mainActivitySource = readWorkspaceSource(repositoryRoot, RELATIVE_PATHS.nativeMainActivity);
  const uploadKinds = extractNativeUploadKinds(uploadKindSource);
  const displayLabels = extractNativeDisplayLabelKinds(mainActivitySource);

  return {
    sourceFiles: {
      nativeUploadKind: RELATIVE_PATHS.nativeUploadKind,
      nativePairingParser: RELATIVE_PATHS.nativePairingParser,
      nativeMainActivity: RELATIVE_PATHS.nativeMainActivity
    },
    pairingQrType: extractNativePairingQrType(pairingParserSource),
    uploadKindNames: uploadKinds.map((entry) => entry.name),
    uploadKindValues: uploadKinds.map((entry) => entry.wireValue),
    displayLabelKinds: displayLabels.map((entry) => entry.name),
    displayLabels: displayLabels.map((entry) => entry.label)
  };
}

export function verifyNativeAndroidMobileUploadContract({ repositoryRoot }) {
  const sharedContract = collectSharedMobileUploadContract({ repositoryRoot });
  const contract = collectNativeAndroidMobileUploadContract({ repositoryRoot });
  const errors = [];

  if (sharedContract.pairingQrType !== contract.pairingQrType) {
    errors.push(
      `Native pairing QR type mismatch. Shared: ${sharedContract.pairingQrType}; Native: ${contract.pairingQrType}.`
    );
  }

  if (!areOrderedListsEqual(sharedContract.uploadKindValues, contract.uploadKindValues)) {
    errors.push(
      `Native upload kind list mismatch. Shared: ${formatOrderedList(
        sharedContract.uploadKindValues
      )}; Native: ${formatOrderedList(contract.uploadKindValues)}.`
    );
  }

  if (!areOrderedListsEqual(contract.uploadKindNames, contract.displayLabelKinds)) {
    errors.push(
      `Native display-label coverage mismatch. Enum kinds: ${formatOrderedList(
        contract.uploadKindNames
      )}; Label kinds: ${formatOrderedList(contract.displayLabelKinds)}.`
    );
  }

  return {
    isConsistent: errors.length === 0,
    errors,
    sharedContract,
    contract
  };
}

export function formatNativeAndroidMobileUploadContractReport(input) {
  const verification =
    "isConsistent" in input ? input : verifyNativeAndroidMobileUploadContract(input);

  const lines = [
    "Android Native Mobile Upload Contract Report",
    `Shared Pairing QR Type: ${verification.sharedContract.pairingQrType}`,
    `Native Pairing QR Type: ${verification.contract.pairingQrType}`,
    `Shared Upload Kinds: ${formatOrderedList(verification.sharedContract.uploadKindValues)}`,
    `Native Upload Kinds: ${formatOrderedList(verification.contract.uploadKindValues)}`,
    `Native Label Coverage: ${formatOrderedList(verification.contract.displayLabelKinds)}`,
    `Status: ${verification.isConsistent ? "passed" : "failed"}`
  ];

  if (verification.errors.length > 0) {
    lines.push("Errors:");
    for (const error of verification.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}
