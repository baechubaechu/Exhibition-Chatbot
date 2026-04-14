import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "256kb",
    },
  },
  /** Windows 등에서 Fast Refresh 후 .next/server/vendor-chunks ENOENT가 나는 경우 완화 */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
