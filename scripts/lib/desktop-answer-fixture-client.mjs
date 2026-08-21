import http from "node:http";
import path from "node:path";

const DEFAULT_CDP_TIMEOUT_MS = 2 * 60 * 1000;

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value ?? "") || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return Number(value);
}

export function parseDesktopBlindAnswerFixtureArguments(args) {
  const allowed = new Set([
    "--pdf",
    "--library",
    "--document-id",
    "--answer-start-page",
    "--output",
    "--cdp-port"
  ]);
  const values = new Map();

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];

    if (!allowed.has(name)) {
      throw new Error(`Unknown argument: ${name ?? "<missing>"}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${name}`);
    }
    values.set(name, value);
  }

  const required = [
    "--pdf",
    "--library",
    "--document-id",
    "--answer-start-page",
    "--output",
    "--cdp-port"
  ];

  for (const name of required) {
    if (!values.has(name)) {
      throw new Error(`Missing required argument: ${name}`);
    }
  }

  return {
    pdfPath: path.resolve(values.get("--pdf")),
    libraryDirectory: path.resolve(values.get("--library")),
    documentId: values.get("--document-id").trim(),
    answerStartPage: parsePositiveInteger(
      values.get("--answer-start-page"),
      "--answer-start-page"
    ),
    outputDirectory: path.resolve(values.get("--output")),
    cdpPort: parsePositiveInteger(values.get("--cdp-port"), "--cdp-port")
  };
}

export function buildDesktopAnswerFixtureExpression(input) {
  const fixtureUrl = JSON.stringify(input.fixtureUrl);
  const pdfFileName = JSON.stringify(input.pdfFileName);
  const documentId = JSON.stringify(input.documentId);
  const expectedRevision = JSON.stringify(String(input.expectedRevision));
  const answerStartPage = JSON.stringify(String(input.answerStartPage));

  return `(async () => {
    const fixtureResponse = await fetch(${fixtureUrl}, { cache: "no-store" });
    if (!fixtureResponse.ok) {
      return { status: fixtureResponse.status, payload: { error: "fixture_pdf_unavailable" } };
    }
    const pdfBytes = await fixtureResponse.arrayBuffer();
    const formData = new FormData();
    formData.append("file", new File([pdfBytes], ${pdfFileName}, { type: "application/pdf" }));
    formData.append("documentId", ${documentId});
    formData.append("expectedRevision", ${expectedRevision});
    formData.append("answerStartPage", ${answerStartPage});
    const response = await fetch("/api/local-library/resume-answer-stage", {
      method: "POST",
      body: formData
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: "invalid_json_response" };
    }
    return { status: response.status, payload };
  })()`;
}

export function selectDesktopRendererTarget(targets) {
  return (
    targets.find(
      (target) =>
        target?.type === "page" &&
        typeof target.url === "string" &&
        /^https?:\/\//.test(target.url) &&
        typeof target.webSocketDebuggerUrl === "string"
    ) ?? null
  );
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForDesktopRendererTarget(cdpPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
        signal: AbortSignal.timeout(2_000)
      });

      if (response.ok) {
        const target = selectDesktopRendererTarget(await response.json());

        if (target) {
          return target;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await wait(250);
  }

  throw new Error(
    `Electron renderer was not available on CDP port ${cdpPort}${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`
  );
}

async function sendCdpCommand(webSocketUrl, method, params, timeoutMs) {
  const socket = new WebSocket(webSocketUrl);
  const commandId = 1;

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out opening Electron CDP WebSocket")),
        timeoutMs
      );
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Failed to open Electron CDP WebSocket"));
      }, { once: true });
    });

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Electron CDP ${method} timed out`)),
        timeoutMs
      );

      socket.addEventListener("message", (event) => {
        let message;

        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (message.id !== commandId) {
          return;
        }

        clearTimeout(timeout);
        if (message.error) {
          reject(new Error(`Electron CDP ${method} failed: ${message.error.message}`));
        } else {
          resolve(message.result);
        }
      });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  } finally {
    socket.close();
  }
}

export async function evaluateInDesktopRenderer(input) {
  const timeoutMs = input.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS;
  const target = await waitForDesktopRendererTarget(input.cdpPort, timeoutMs);
  const result = await sendCdpCommand(
    target.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: input.expression,
      awaitPromise: true,
      returnByValue: true
    },
    timeoutMs
  );

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "Electron renderer evaluation failed"
    );
  }

  return result.result?.value;
}

async function startPdfFixtureServer(pdfBytes) {
  const server = http.createServer((request, response) => {
    if (request.url !== "/fixture.pdf") {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/pdf",
      "Content-Length": pdfBytes.byteLength
    });
    response.end(pdfBytes);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Temporary PDF fixture server did not bind a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/fixture.pdf`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

export async function postAnswerStageThroughDesktopRenderer(input, dependencies = {}) {
  const servePdf = dependencies.servePdf ?? startPdfFixtureServer;
  const evaluate = dependencies.evaluateInRenderer ?? evaluateInDesktopRenderer;
  const fixtureServer = await servePdf(input.pdfBytes);

  try {
    const result = await evaluate({
      cdpPort: input.cdpPort,
      expression: buildDesktopAnswerFixtureExpression({
        fixtureUrl: fixtureServer.url,
        pdfFileName: input.pdfFileName,
        documentId: input.documentId,
        expectedRevision: input.expectedRevision,
        answerStartPage: input.answerStartPage
      }),
      timeoutMs: input.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS
    });

    if (!result || !Number.isInteger(result.status)) {
      throw new Error("Electron renderer returned an invalid answer-stage response");
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `/api/local-library/resume-answer-stage returned HTTP ${result.status}: ${
          result.payload?.error ?? "unknown_error"
        }`
      );
    }

    return result.payload;
  } finally {
    await fixtureServer.close();
  }
}
