/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'celeitoroast.netlify.app',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;