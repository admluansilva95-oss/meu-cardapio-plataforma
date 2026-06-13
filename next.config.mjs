/** @type {import('next').NextConfig} */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.BUILD_ID?.trim() ||
  `local-${process.env.npm_package_version || "0.1.0"}`;

const nextConfig = {
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