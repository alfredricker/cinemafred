/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-f58c527a326541cc87548f3216502f10.r2.dev',
        pathname: '/cinemafred/**',
      },
    ],
    minimumCacheTTL: 60,
    formats: ['image/webp'],
  },
  typescript: {
    ignoreBuildErrors: false
  },
  reactStrictMode: true
}

module.exports = nextConfig