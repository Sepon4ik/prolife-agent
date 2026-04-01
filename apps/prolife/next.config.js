/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@agency/ui",
    "@agency/auth",
    "@agency/ai",
    "@agency/email",
    "@agency/queue",
    "@agency/scraping",
    "@agency/env",
  ],
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      ".prisma/client",
      "crawlee",
      "@crawlee/core",
      "@crawlee/browser",
      "@crawlee/cheerio",
      "@crawlee/playwright",
      "@crawlee/puppeteer",
      "playwright",
      "playwright-core",
      "puppeteer",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize heavy native packages to prevent webpack resolution errors
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "crawlee",
        "playwright",
        "playwright-core",
        "puppeteer",
        "@crawlee/core",
        "@crawlee/browser",
        "@crawlee/cheerio",
        "@crawlee/playwright",
        "@crawlee/puppeteer",
      ];
    }
    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
