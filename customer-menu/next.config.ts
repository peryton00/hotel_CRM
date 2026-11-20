import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Allow all local network interfaces for HMR in development
  allowedDevOrigins: [
    "localhost:3001",
    "127.0.0.1:3001",
    "192.168.56.1:3001",
    "10.125.79.50:3001",
    "192.168.56.1",
    "10.125.79.50",
    "localhost",
  ],
};

export default nextConfig;
