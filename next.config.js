/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'main-node.rickermedia.com',
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