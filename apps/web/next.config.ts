import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@momo/domain', '@momo/db'],
  serverExternalPackages: ['pg'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default config;
