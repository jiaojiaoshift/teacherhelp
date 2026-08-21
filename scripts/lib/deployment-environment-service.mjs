import { parseEnv } from "node:util";

export function mergeDeploymentEnvironment(input) {
  const fileEnvironment = input.envFileContent ? parseEnv(input.envFileContent) : {};

  return {
    ...fileEnvironment,
    ...input.environment
  };
}
