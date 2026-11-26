import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page here is per-user and database-backed, so we use the classic
  // dynamic rendering model instead of Cache Components.
  serverExternalPackages: ['unpdf', 'mammoth'],
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
