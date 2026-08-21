import type { Metadata } from "next";

type PublicOriginEnvironment = Record<string, string | undefined>;

export function resolveTeachHelperPublicOrigin(
  environment: PublicOriginEnvironment = process.env
): string | null {
  const rawValue = environment.TEACHHELPER_PUBLIC_ORIGIN?.trim();

  if (!rawValue) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("TEACHHELPER_PUBLIC_ORIGIN must be an absolute http or https origin.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("TEACHHELPER_PUBLIC_ORIGIN must use http or https.");
  }

  if (url.username || url.password) {
    throw new Error("TEACHHELPER_PUBLIC_ORIGIN must not contain credentials.");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("TEACHHELPER_PUBLIC_ORIGIN must be a root origin without a path, query or hash.");
  }

  return url.origin;
}

export function buildTeachHelperMetadata(
  environment: PublicOriginEnvironment = process.env
): Metadata {
  const publicOrigin = resolveTeachHelperPublicOrigin(environment);

  return {
    title: "智题库",
    description: "教培智能题库工作台",
    applicationName: "TeachHelper",
    ...(publicOrigin ? { metadataBase: new URL(`${publicOrigin}/`) } : {}),
    icons: {
      icon: [{ type: "image/png", url: "/icon.png" }]
    }
  };
}
