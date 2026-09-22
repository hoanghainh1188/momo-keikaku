import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  transpilePackages: ['@momo/domain', '@momo/db', '@momo/app', '@momo/adapters', '@momo/db-auth', '@momo/i18n'],
  serverExternalPackages: ['pg'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(config);
