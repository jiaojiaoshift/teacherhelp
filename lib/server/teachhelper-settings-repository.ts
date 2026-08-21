import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_TEACHHELPER_SETTINGS,
  mergeTeachHelperSettings,
  normalizeTeachHelperSettings,
  toPublicTeachHelperSettings,
  validateTeachHelperSettingsPatch,
  type PublicTeachHelperSettings,
  type TeachHelperSettings,
  type TeachHelperSettingsPatch
} from "@/lib/config/app-settings";
import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

interface RepositoryOptions {
  filePath?: string;
  environment?: NodeJS.ProcessEnv;
}

const saveQueues = new Map<string, Promise<void>>();

export class InvalidTeachHelperSettingsError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "InvalidTeachHelperSettingsError";
    this.code = code;
  }
}

function parseStoredSettings(value: unknown): TeachHelperSettings {
  return normalizeTeachHelperSettings(value);
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export class TeachHelperSettingsRepository {
  private readonly filePath: string;

  constructor(options: RepositoryOptions = {}) {
    this.filePath =
      options.filePath ??
      resolveTeachHelperStoragePaths({ environment: options.environment }).settingsFile;
  }

  async loadInternal(): Promise<TeachHelperSettings> {
    try {
      return parseStoredSettings(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return DEFAULT_TEACHHELPER_SETTINGS;
    }
  }

  async loadPublic(): Promise<PublicTeachHelperSettings> {
    return toPublicTeachHelperSettings(await this.loadInternal());
  }

  async save(input: unknown): Promise<PublicTeachHelperSettings> {
    const validation = validateTeachHelperSettingsPatch(input);

    if (!validation.ok) {
      throw new InvalidTeachHelperSettingsError(validation.error);
    }

    const previousQueue = saveQueues.get(this.filePath) ?? Promise.resolve();
    let releaseQueue: () => void = () => undefined;
    const currentGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    saveQueues.set(this.filePath, previousQueue.then(() => currentGate));
    await previousQueue;

    try {
      const current = await this.loadInternal();
      const next = mergeTeachHelperSettings(current, validation.value);
      await writeJsonAtomic(this.filePath, next);
      return toPublicTeachHelperSettings(next);
    } finally {
      releaseQueue();
    }
  }

  async clearApiKey(): Promise<PublicTeachHelperSettings> {
    return this.save({ clearApiKey: true });
  }
}

export function readTeachHelperSettingsSync(
  environment: NodeJS.ProcessEnv = process.env
): TeachHelperSettings | null {
  const filePath = resolveTeachHelperStoragePaths({ environment }).settingsFile;

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return parseStoredSettings(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}
