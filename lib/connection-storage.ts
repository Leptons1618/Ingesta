import { type DatabaseConfig } from "@/lib/database-manager"

const CONNECTIONS_KEY = 'database-connections'

export class ConnectionStorage {
  static saveConnection(config: DatabaseConfig): void {
    const connections = this.getAllConnections()
    const existingIndex = connections.findIndex(c => c.id === config.id)
    
    if (existingIndex >= 0) {
      connections[existingIndex] = config
    } else {
      connections.push(config)
    }
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections))
    }
  }

  static getConnection(id: string): DatabaseConfig | undefined {
    const connections = this.getAllConnections()
    return connections.find(c => c.id === id)
  }

  static getAllConnections(): DatabaseConfig[] {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(CONNECTIONS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  static removeConnection(id: string): void {
    const connections = this.getAllConnections().filter(c => c.id !== id)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections))
    }
  }

  static generateConnectionString(config: DatabaseConfig): string {
    switch (config.type) {
      case "mysql":
        return `mysql://${config.username}:${config.password}@${config.host}:${config.port || 3306}/${config.database}${config.ssl ? "?ssl=true" : ""}`
      case "postgresql":
        return `postgresql://${config.username}:${config.password}@${config.host}:${config.port || 5432}/${config.database}${config.ssl ? "?sslmode=require" : ""}`
      case "sqlite":
        return `sqlite://${config.database}`
      case "mssql":
        return `mssql://${config.username}:${config.password}@${config.host}:${config.port || 1433}/${config.database}${config.ssl ? "?encrypt=true" : ""}`
      default:
        return ""
    }
  }
}
