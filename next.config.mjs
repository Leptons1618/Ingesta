/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Exclude native Node.js modules from client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        util: false,
        url: false,
        assert: false,
      }
      
      // Externalize database drivers on client side
      config.externals = [
        ...(config.externals || []),
        'pg',
        'mysql2',
        'sqlite3',
        'mssql',
        'tedious',
        'pg-native',
      ]
    }
    
    return config
  },
}

export default nextConfig