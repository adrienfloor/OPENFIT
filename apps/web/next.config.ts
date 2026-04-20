import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile shared packages from the monorepo
  transpilePackages: ['@openfit/types'],
  eslint: {
    // Lint errors are caught by `npm run lint` in CI — don't block dev builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
