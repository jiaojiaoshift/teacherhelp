import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { postJsonWithNodeHttp } from "../../scripts/lib/json-http-client.mjs";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
});

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("json http client", () => {
  it("waits for delayed response headers within the explicit request timeout", async () => {
    const serverUrl = await listen(
      createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          setTimeout(() => {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ received: JSON.parse(body) }));
          }, 60);
        });
      })
    );

    await expect(
      postJsonWithNodeHttp(`${serverUrl}/slow`, { page: 8 }, { timeoutMs: 250 })
    ).resolves.toEqual({ received: { page: 8 } });
  });

  it("aborts a stalled request at the configured timeout", async () => {
    const serverUrl = await listen(
      createServer((_request, _response) => {
        // Intentionally leave the response open until the client timeout closes the socket.
      })
    );

    await expect(
      postJsonWithNodeHttp(`${serverUrl}/stalled`, {}, { timeoutMs: 30 })
    ).rejects.toThrow(/timed out/i);
  });

  it("rejects non-success responses without exposing their body", async () => {
    const serverUrl = await listen(
      createServer((_request, response) => {
        response.writeHead(503, { "Content-Type": "text/plain" });
        response.end("upstream secret body");
      })
    );

    await expect(
      postJsonWithNodeHttp(`${serverUrl}/failed`, {}, { timeoutMs: 250 })
    ).rejects.toThrow("HTTP 503");
  });
});
