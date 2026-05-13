/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cinemafred-origin.rickermedia.com',
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

export default nextConfig