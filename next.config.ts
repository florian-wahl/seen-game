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
