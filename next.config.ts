import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable type checking during builds on Vercel
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable ESLint build blocking on Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
