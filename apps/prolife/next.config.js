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
};

module.exports = nextConfig;
