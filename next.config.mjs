/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  serverExternalPackages: ["pg", "mysql2", "sqlite3", "mssql", "tedious"],
}

export default nextConfig
