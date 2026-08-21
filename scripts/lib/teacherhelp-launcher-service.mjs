import http from "node:http";
import https from "node:https";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function probeUrl(url) {
  const client = url.startsWith("https:") ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      response.resume();
      resolve({
        statusCode: response.statusCode ?? 0
      });
    });

    request.on("error", reject);
    request.setTimeout(3000, () => {
      request.destroy(new Error(`Timed out while probing ${url}.`));
    });
  });
}

export async function waitForServerReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60000;
  const intervalMs = options.intervalMs ?? 500;
  const probe = options.probe ?? probeUrl;
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const result = await probe(url);

      if (result.statusCode >= 200 && result.statusCode < 500) {
        return result;
      }

      lastError = new Error(`HTTP ${result.statusCode}`);
    } catch (error) {
      lastError = error;
    }

    await delay(intervalMs);
  }

  const reason = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`Timed out waiting for ${url} to become ready: ${reason}`);
}
