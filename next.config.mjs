/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '500mb' } },
}
export default nextConfig
