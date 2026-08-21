import { describe, expect, it } from "vitest";

import { resolveMobileUploadHelperBaseUrl } from "@/lib/server/mobile-upload-helper-base-url";

describe("mobile-upload-helper-base-url", () => {
  it("keeps one non-local request origin unchanged", () => {
    expect(
      resolveMobileUploadHelperBaseUrl({
        requestUrl: "http://192.168.1.8:3000/api/mobile-upload/pairing",
        getNetworkInterfaces: () => ({
          Ethernet: [
            {
              address: "192.168.1.8",
              netmask: "255.255.255.0",
              family: "IPv4",
              mac: "00:00:00:00:00:00",
              internal: false,
              cidr: "192.168.1.8/24"
            }
          ]
        })
      })
    ).toBe("http://192.168.1.8:3000");
  });

  it("replaces one localhost origin with the first available private ipv4 address", () => {
    expect(
      resolveMobileUploadHelperBaseUrl({
        requestUrl: "http://localhost:3000/api/mobile-upload/pairing",
        getNetworkInterfaces: () => ({
          Loopback: [
            {
              address: "127.0.0.1",
              netmask: "255.0.0.0",
              family: "IPv4",
              mac: "00:00:00:00:00:00",
              internal: true,
              cidr: "127.0.0.1/8"
            }
          ],
          Ethernet: [
            {
              address: "192.168.1.8",
              netmask: "255.255.255.0",
              family: "IPv4",
              mac: "00:00:00:00:00:01",
              internal: false,
              cidr: "192.168.1.8/24"
            }
          ]
        })
      })
    ).toBe("http://192.168.1.8:3000");
  });

  it("falls back to localhost when no private ipv4 address is available", () => {
    expect(
      resolveMobileUploadHelperBaseUrl({
        requestUrl: "http://localhost:3000/api/mobile-upload/pairing",
        getNetworkInterfaces: () => ({
          Loopback: [
            {
              address: "127.0.0.1",
              netmask: "255.0.0.0",
              family: "IPv4",
              mac: "00:00:00:00:00:00",
              internal: true,
              cidr: "127.0.0.1/8"
            }
          ]
        })
      })
    ).toBe("http://localhost:3000");
  });

  it("uses the public deployment origin behind a reverse proxy", () => {
    expect(
      resolveMobileUploadHelperBaseUrl({
        requestUrl: "http://127.0.0.1:3000/api/mobile-upload/pairing",
        environment: {
          TEACHHELPER_PUBLIC_ORIGIN: "https://library.example.com/"
        },
        getNetworkInterfaces: () => ({})
      })
    ).toBe("https://library.example.com");
  });

  it("keeps the mobile-specific base URL above the general public origin", () => {
    expect(
      resolveMobileUploadHelperBaseUrl({
        requestUrl: "http://localhost:3000/api/mobile-upload/pairing",
        environment: {
          TEACHHELPER_MOBILE_UPLOAD_BASE_URL: "https://mobile.example.com",
          TEACHHELPER_PUBLIC_ORIGIN: "https://library.example.com"
        },
        getNetworkInterfaces: () => ({})
      })
    ).toBe("https://mobile.example.com");
  });
});
