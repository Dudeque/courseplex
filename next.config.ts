import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
  // Dev only: allow phones/other PCs on the LAN (IPs and .local names) to load dev assets and hydrate.
  allowedDevOrigins: ['*.*.*.*', '*.local'],
  async headers() {
    return [
      {
        source: '/api/local/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Range' },
          { key: 'Access-Control-Expose-Headers', value: 'Content-Range, Accept-Ranges, Content-Length' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
