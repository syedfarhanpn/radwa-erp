import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RADWA ERP is a frontend-only demo: all workflow state lives in the browser
  // (zustand + localStorage), so server-side component caching is not useful here.
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
