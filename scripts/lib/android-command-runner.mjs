import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

export const repositoryRoot = path.resolve(currentDirectory, "../..");
export const androidAppRoot = path.join(repositoryRoot, "android-app");
export const androidExpoPrebuildRoot = path.join(androidAppRoot, "android");
export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
export const gradleCommand = path.join(
  androidAppRoot,
  process.platform === "win32" ? "gradlew.bat" : "gradlew"
);
export const expoGradleCommand = path.join(
  androidExpoPrebuildRoot,
  process.platform === "win32" ? "gradlew.bat" : "gradlew"
);

export function createAndroidCommandEnvironment() {
  const nextEnvironment = {
    ...process.env
  };
  const bundledJavaHome = path.join(repositoryRoot, "tmp", "toolchains", "jdk-21");
  const bundledJavaExecutable = path.join(
    bundledJavaHome,
    "bin",
    process.platform === "win32" ? "java.exe" : "java"
  );
  const bundledAndroidSdk = path.join(repositoryRoot, "android-sdk");

  if (existsSync(bundledJavaExecutable)) {
    nextEnvironment.JAVA_HOME = bundledJavaHome;
  }

  if (existsSync(bundledAndroidSdk)) {
    nextEnvironment.ANDROID_HOME = bundledAndroidSdk;
    nextEnvironment.ANDROID_SDK_ROOT = bundledAndroidSdk;
  }

  return nextEnvironment;
}

export function runAndroidCommand(label, command, args, options = {}) {
  console.log(`\n== ${label} ==`);
  console.log(`${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? createAndroidCommandEnvironment(),
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(result.error.message);
  }

  return {
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1
  };
}

export function runAndroidExpoTypecheck() {
  return runAndroidCommand("Expo line typecheck", npmCommand, ["run", "typecheck"], {
    cwd: androidAppRoot
  });
}

export function runAndroidExpoAssembleRelease() {
  const releaseEnvironment = createAndroidCommandEnvironment();
  releaseEnvironment.NODE_ENV = "production";

  return runAndroidCommand(
    "Expo line :app:assembleRelease",
    expoGradleCommand,
    [":app:assembleRelease"],
    {
      cwd: androidExpoPrebuildRoot,
      env: releaseEnvironment
    }
  );
}

export function runAndroidNativeCoreTest() {
  return runAndroidCommand("Native line :core:test", gradleCommand, [":core:test"], {
    cwd: androidAppRoot
  });
}

export function runAndroidNativeAssembleDebug() {
  return runAndroidCommand("Native line :app:assembleDebug", gradleCommand, [":app:assembleDebug"], {
    cwd: androidAppRoot
  });
}
