import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    unoptimized: true,
  },
  logging: {
    incomingRequests: {
      ignore: [/\/auth\/callback/],
    },
  },
  reactStrictMode: true,
};

export default nextConfig;

initOpenNextCloudflareForDev();
