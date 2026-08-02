/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @smartwork/shared ships TypeScript-compiled CJS from the workspace; Next must
  // transpile it rather than treat it as a prebuilt external.
  transpilePackages: ['@smartwork/shared'],
  eslint: {
    // Lint is run from the repo root via `npm run lint`; don't fail production
    // builds on style nits during a hackathon demo.
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
