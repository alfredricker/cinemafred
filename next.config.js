/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '17eb349fd2bf73bcaa03d603e8152f91.r2.cloudflarestorage.com',  // Adjust this based on your actual S3 API URL
        pathname: '/cinemafred/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false
  },
  reactStrictMode: true
}

module.exports = nextConfig