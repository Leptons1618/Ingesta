export interface DatabaseConfig {
  id: string
  name: string
  type: "mysql" | "postgresql" | "sqlite" | "mssql"
  host?: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  connectionString?: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  details?: {
    serverVersion?: string
    databaseName?: string
    tablesCount?: number
  }
}

export interface DatabaseTable {
  name: string
  columns: DatabaseColumn[]
  rowCount?: number
}

export interface DatabaseColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue?: string
}

export class DatabaseManager {
  private static connections: Map<string, DatabaseConfig> = new Map()

  static async testConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    try {
      // Simulate connection test - in a real app, this would make actual database calls
      await new Promise((resolve) => setTimeout(resolve, 1500)) // Simulate network delay

      // Mock validation
      if (!config.database) {
        return {
          success: false,
          message: "Database name is required",
        }
      }

      if (config.type !== "sqlite" && !config.host) {
        return {
          success: false,
          message: "Host is required for remote databases",
        }
      }

      if (config.type !== "sqlite" && !config.username) {
        return {
          success: false,
          message: "Username is required",
        }
      }

      // Mock successful connection
      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: this.getMockServerVersion(config.type),
          databaseName: config.database,
          tablesCount: Math.floor(Math.random() * 20) + 5,
        },
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  static async getTables(config: DatabaseConfig): Promise<DatabaseTable[]> {
    // Mock table data - in a real app, this would query the database
    const mockTables: DatabaseTable[] = [
      {
        name: "users",
        columns: [
          { name: "id", type: "INT", nullable: false, isPrimaryKey: true },
          { name: "email", type: "VARCHAR(255)", nullable: false, isPrimaryKey: false },
          { name: "name", type: "VARCHAR(100)", nullable: true, isPrimaryKey: false },
          { name: "created_at", type: "TIMESTAMP", nullable: false, isPrimaryKey: false },
        ],
        rowCount: 1250,
      },
      {
        name: "products",
        columns: [
          { name: "id", type: "INT", nullable: false, isPrimaryKey: true },
          { name: "name", type: "VARCHAR(200)", nullable: false, isPrimaryKey: false },
          { name: "price", type: "DECIMAL(10,2)", nullable: false, isPrimaryKey: false },
          { name: "category_id", type: "INT", nullable: true, isPrimaryKey: false },
        ],
        rowCount: 450,
      },
      {
        name: "orders",
        columns: [
          { name: "id", type: "INT", nullable: false, isPrimaryKey: true },
          { name: "user_id", type: "INT", nullable: false, isPrimaryKey: false },
          { name: "total", type: "DECIMAL(10,2)", nullable: false, isPrimaryKey: false },
          { name: "status", type: "VARCHAR(50)", nullable: false, isPrimaryKey: false },
          { name: "created_at", type: "TIMESTAMP", nullable: false, isPrimaryKey: false },
        ],
        rowCount: 3200,
      },
    ]

    return mockTables
  }

  static saveConnection(config: DatabaseConfig): void {
    this.connections.set(config.id, config)
  }

  static getConnection(id: string): DatabaseConfig | undefined {
    return this.connections.get(id)
  }

  static getAllConnections(): DatabaseConfig[] {
    return Array.from(this.connections.values())
  }

  static removeConnection(id: string): void {
    this.connections.delete(id)
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

  private static getMockServerVersion(type: string): string {
    const versions = {
      mysql: "8.0.35",
      postgresql: "15.4",
      sqlite: "3.42.0",
      mssql: "2022 (16.0.1000.6)",
    }
    return versions[type as keyof typeof versions] || "Unknown"
  }
}
