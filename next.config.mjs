/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // @napi-rs/canvas ships a native .node binary — keep it external so webpack
  // doesn't try to bundle/parse it during the server build.
  experimental: {
    serverActions: { bodySizeLimit: '500mb' },
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
  },
}
export default nextConfig
