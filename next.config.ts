import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
};

export default nextConfig;
