import { resolveNextOutputConfig } from "./scripts/lib/next-output-config.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...resolveNextOutputConfig(process.env),
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas"]
  }
};

export default nextConfig;
