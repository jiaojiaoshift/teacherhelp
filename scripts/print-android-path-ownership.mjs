import { formatAndroidPathOwnershipGuide } from "./lib/android-path-ownership-service.mjs";
import { buildAndroidPathOwnershipGuide } from "./lib/android-path-ownership-service.mjs";

const reviewPaths = process.argv.slice(2);

console.log(formatAndroidPathOwnershipGuide(reviewPaths));

const guide = buildAndroidPathOwnershipGuide(reviewPaths);

if (guide.shouldFail) {
  process.exitCode = 1;
}
