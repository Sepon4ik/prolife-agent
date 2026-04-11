/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
  transpilePackages: [
    "@agency/ui",
    "@agency/auth",
    "@agency/ai",
    "@agency/email",
    "@agency/queue",
    "@agency/scraping",
    "@agency/env",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("re2");
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
