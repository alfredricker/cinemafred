/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true, // Cloudflare Pages doesn't support Next.js Image Optimization
    domains: ['your-r2-bucket-domain.com'], // Add your R2 bucket domain
  },
}

module.exports = nextConfig
