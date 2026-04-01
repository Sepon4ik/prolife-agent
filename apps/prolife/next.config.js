/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@agency/ui",
    "@agency/auth",
    "@agency/db",
    "@agency/ai",
    "@agency/email",
    "@agency/queue",
    "@agency/scraping",
    "@agency/env",
  ],
  // Externalize heavy native packages from serverless bundling
  serverExternalPackages: [
    "crawlee",
    "playwright",
    "playwright-core",
    "@crawlee/playwright",
    "@crawlee/cheerio",
    "@crawlee/browser",
    "@crawlee/core",
    "cheerio",
    "@prisma/client",
    "prisma",
  ],
  // Ignore build errors from optional dependencies
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
