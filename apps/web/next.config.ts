import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile shared packages from the monorepo
  transpilePackages: ['@openfit/types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
