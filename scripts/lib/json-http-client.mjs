import http from "node:http";
import https from "node:https";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

export function postJsonWithNodeHttp(url, body, options = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const requestBody = JSON.stringify(body);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`${target.pathname} returned HTTP ${statusCode}`));
          return;
        }

        const chunks = [];
        let receivedBytes = 0;

        response.on("data", (chunk) => {
          receivedBytes += chunk.length;

          if (receivedBytes > maxResponseBytes) {
            response.destroy(new Error(`${target.pathname} response exceeded size limit`));
            return;
          }

          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error(`${target.pathname} returned invalid JSON`));
          }
        });
        response.on("error", reject);
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`${target.pathname} timed out after ${timeoutMs} ms`));
    });
    request.on("error", reject);
    request.end(requestBody);
  });
}
