import type { NextConfig } from "next";

// Every page is generated at build time from content/ and rankings/. Nothing
// reads request data, so Cache Components stays off: classic static generation
// lets unknown playbook slugs 404 (dynamicParams = false). See docs/DECISIONS.md.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The connector routes read content/ and rankings/ when a request arrives,
  // so their files ship with those functions.
  outputFileTracingIncludes: {
    "/api/mcp": ["./content/**/*", "./rankings/**/*"],
    "/llms.txt": ["./content/**/*", "./rankings/**/*"],
    "/install": ["./content/**/*"],
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
