/** @type {import('next').NextConfig} */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.BUILD_ID?.trim() ||
  `local-${process.env.npm_package_version || "0.1.0"}`;

const nextConfig = {
  /** Playwright usa 127.0.0.1; sem isto o HMR falha e o cliente pode ficar inconsistente no dev. */
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    /** Comparado com `GET /api/build-info` para reload após novo deploy. */
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'celeitoroast.netlify.app',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/**',
      },
    ],
  },
};

export default nextConfig;