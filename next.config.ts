import type { NextConfig } from "next";

// Test hooks (/dev/login etc.) must never ship to a deployed production environment.
if (process.env.NEXT_PUBLIC_E2E_TEST_HOOKS === "1" && process.env.VERCEL_ENV === "production") {
  throw new Error(
    "NEXT_PUBLIC_E2E_TEST_HOOKS=1 must never be set on a production deployment (it enables /dev/login). Unset it.",
  );
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Content-hashed bundles never change.
        source: "/library/bundles/:file(library-.*\\.json)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/library/bundles/current.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
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
