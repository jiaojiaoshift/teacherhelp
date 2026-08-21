import { describe, expect, it } from "vitest";

import { mergeDeploymentEnvironment } from "../../scripts/lib/deployment-environment-service.mjs";

describe("deployment environment service", () => {
  it("loads dotenv values while preserving explicit process overrides", () => {
    expect(
      mergeDeploymentEnvironment({
        environment: {
          TEACHHELPER_AI_MODEL: "process-model"
        },
        envFileContent: [
          "TEACHHELPER_AI_PROVIDER=openai-compatible",
          "TEACHHELPER_AI_MODEL=file-model",
          "TEACHHELPER_AI_API_KEY=placeholder-secret"
        ].join("\n")
      })
    ).toMatchObject({
      TEACHHELPER_AI_PROVIDER: "openai-compatible",
      TEACHHELPER_AI_MODEL: "process-model",
      TEACHHELPER_AI_API_KEY: "placeholder-secret"
    });
  });

  it("accepts an absent local env file", () => {
    expect(
      mergeDeploymentEnvironment({
        environment: { NODE_ENV: "production" },
        envFileContent: null
      })
    ).toEqual({ NODE_ENV: "production" });
  });
});
