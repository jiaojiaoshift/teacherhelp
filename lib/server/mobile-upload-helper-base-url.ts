import { networkInterfaces } from "node:os";

import { resolveTeachHelperPublicOrigin } from "@/lib/config/public-origin";

function normalizeOverrideBaseUrl(value: string) {
  return new URL(value).origin;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0";
}

function isPrivateIpv4(address: string) {
  if (address.startsWith("10.")) {
    return true;
  }

  if (address.startsWith("192.168.")) {
    return true;
  }

  const parts = address.split(".");

  if (parts.length !== 4 || parts.some((part) => part.trim() === "" || Number.isNaN(Number(part)))) {
    return false;
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  return first === 172 && second >= 16 && second <= 31;
}

function getAddressPriority(address: string) {
  if (address.startsWith("192.168.")) {
    return 300;
  }

  const parts = address.split(".");
  const first = Number(parts[0]);
  const second = Number(parts[1]);

  if (first === 172 && second >= 16 && second <= 31) {
    return 200;
  }

  if (address.startsWith("10.")) {
    return 100;
  }

  return 0;
}

function getInterfacePriority(interfaceName: string) {
  const normalizedName = interfaceName.trim().toLowerCase();
  let priority = 0;

  if (
    normalizedName.includes("wifi") ||
    normalizedName.includes("wi-fi") ||
    normalizedName.includes("wlan") ||
    normalizedName.includes("wireless")
  ) {
    priority += 300;
  }

  if (
    normalizedName.includes("ethernet") ||
    normalizedName.includes("以太网") ||
    normalizedName === "eth0" ||
    normalizedName.startsWith("eth")
  ) {
    priority += 250;
  }

  if (
    normalizedName.includes("vethernet") ||
    normalizedName.includes("hyper-v") ||
    normalizedName.includes("virtual") ||
    normalizedName.includes("vmware") ||
    normalizedName.includes("virtualbox") ||
    normalizedName.includes("docker") ||
    normalizedName.includes("wsl") ||
    normalizedName.includes("tailscale") ||
    normalizedName.includes("zerotier") ||
    normalizedName.includes("loopback") ||
    normalizedName.includes("bridge") ||
    normalizedName.includes("tun") ||
    normalizedName.includes("tap")
  ) {
    priority -= 500;
  }

  return priority;
}

export function resolveMobileUploadHelperBaseUrl(input: {
  requestUrl: string;
  getNetworkInterfaces?: typeof networkInterfaces;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment ?? process.env;
  const mobileOverrideBaseUrl = environment.TEACHHELPER_MOBILE_UPLOAD_BASE_URL?.trim();

  if (mobileOverrideBaseUrl) {
    return normalizeOverrideBaseUrl(mobileOverrideBaseUrl);
  }

  const publicOrigin = resolveTeachHelperPublicOrigin(environment);

  if (publicOrigin) {
    return publicOrigin;
  }

  const requestUrl = new URL(input.requestUrl);

  if (!isLoopbackHost(requestUrl.hostname)) {
    return requestUrl.origin;
  }

  const getNetworkInterfaces = input.getNetworkInterfaces ?? networkInterfaces;
  const lanInterface = Object.entries(getNetworkInterfaces())
    .flatMap(([interfaceName, detailsList]) =>
      (detailsList ?? []).map((details) => ({
        interfaceName,
        details
      }))
    )
    .filter(
      (
        entry
      ): entry is {
        interfaceName: string;
        details: NonNullable<(ReturnType<typeof networkInterfaces>[string] | undefined)>[number];
      } => Boolean(entry.details)
    )
    .filter(
      ({ details }) =>
        details.family === "IPv4" &&
        !details.internal &&
        isPrivateIpv4(details.address)
    )
    .sort(
      (left, right) =>
        getInterfacePriority(right.interfaceName) - getInterfacePriority(left.interfaceName) ||
        getAddressPriority(right.details.address) - getAddressPriority(left.details.address)
    )[0];

  if (!lanInterface) {
    return requestUrl.origin;
  }

  requestUrl.hostname = lanInterface.details.address;

  return requestUrl.origin;
}
