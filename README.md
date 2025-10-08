# 🚀 Ingesta - Intelligent Excel to Database Import System

> A powerful Next.js application that intelligently transforms Excel files into database tables with automatic data type detection, schema generation, and multi-database support.

[![Next.js](https://img.shields.io/badge/Next.js-15.2.4-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## ✨ Features

### 🎯 Core Functionality
- **📁 Excel File Upload** - Drag & drop or browse to upload multiple Excel files (.xlsx, .xls)
- **👁️ Live Preview** - Preview Excel data with headers and sample rows before import
- **🔌 Multi-Database Support** - PostgreSQL, MySQL, MSSQL, SQLite
- **🔗 Connection Management** - Save and reuse database connections securely
- **📊 Sheet Selection** - Choose which sheets to import from Excel files
- **🤖 Intelligent Type Detection** - Automatic detection of data types (integers, decimals, dates, booleans, emails, URLs, JSON)
- **⚙️ Smart Table Configuration** - Auto-generate table schemas with intelligent column suggestions
- **📈 Data Insights** - Real-time analysis of data quality, null percentages, and primary key suggestions
- **✅ Data Validation** - Preview and validate data before insertion
- **🎨 Dark Mode** - Full dark mode support with system preference detection

### 🧠 Intelligent Features
- **Auto-Type Optimization** - Database-specific type adaptation (e.g., `VARCHAR` → `NVARCHAR` for MSSQL)
- **Primary Key Detection** - Automatically suggests optimal primary keys based on uniqueness
- **Null Handling** - Smart null value detection and conversion
- **Data Quality Insights** - Identifies potential issues before table creation
- **Column Statistics** - Shows unique values, null counts, and max lengths
- **Type Suggestions** - Recommends optimal data types for each column

### 💾 Database Support

| Database | Status | Features |
|----------|--------|----------|
| **PostgreSQL** | ✅ Full Support | SERIAL, TIMESTAMP, JSONB, UUID support |
| **MySQL** | ✅ Full Support | TINYINT, ENUM, JSON support |
| **MSSQL** | ✅ Full Support | NVARCHAR, BIT, DATETIME2 support |
| **SQLite** | ✅ Full Support | INTEGER PRIMARY KEY, TEXT, REAL support |

## 🎬 Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **pnpm** 10.15.0 or higher (recommended) or npm/yarn
- Database server (PostgreSQL, MySQL, MSSQL, or SQLite)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Leptons1618/Ingesta.git
cd Ingesta
```

2. **Install dependencies**
```bash
# Using pnpm (recommended)
corepack enable
corepack pnpm install

# Or using npm
npm install
```

3. **Run the development server**
```bash
# Using pnpm
corepack pnpm dev

# Or using npm
npm run dev
```

4. **Open your browser**
```
http://localhost:3000
```

## 📖 Usage Guide

### 1️⃣ Upload Excel Files
- Drag and drop Excel files or click to browse
- Supports multiple file uploads
- Preview data before proceeding

### 2️⃣ Connect to Database
- Click **"Connect to Database"**
- Select database type (PostgreSQL, MySQL, MSSQL, SQLite)
- Enter connection details (host, port, username, password, database name)
- Save connection for future use

### 3️⃣ Select Sheets
- Choose which sheets to import from your Excel files
- Preview sheet data with headers
- Select multiple sheets for batch processing

### 4️⃣ Configure Tables
The intelligent table configuration interface provides:

**Automatic Features:**
- ✅ Auto-detected data types for each column
- ✅ Primary key suggestions based on data uniqueness
- ✅ Column statistics (unique values, null counts, max length)
- ✅ Data quality insights with emoji indicators

**Manual Controls:**
- Edit table names
- Modify column names
- Adjust data types (dropdown with database-specific types)
- Toggle nullable constraints
- Add/remove columns
- Set primary keys

**Smart Insights Panel:**
- 📊 **Data Quality**: Percentage of non-null values
- 🔑 **Primary Key Candidates**: Columns suitable as primary keys
- 🎯 **Type Distribution**: Breakdown of detected types
- ⚠️ **Warnings**: Potential issues (high null percentage, no primary key)

### 5️⃣ Create Tables & Insert Data
- Click **"Create N Tables"** button
- Tables are created with optimized schemas
- Data is inserted with proper type conversion
- Null values handled intelligently
- Progress shown for each table

### 6️⃣ Preview Created Tables
- View all created tables with row counts
- Preview first 10 rows of each table
- Navigate between tables
- Verify data insertion success

## 🏗️ Project Structure

```
ingesta/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with theme provider
│   ├── page.tsx                 # Main application page (8-step workflow)
│   ├── globals.css              # Global styles
│   └── api/                     # API routes
│       ├── database/            # Database operations
│       │   ├── connections/     # List saved connections
│       │   ├── create-table/    # Create table endpoint
│       │   ├── insert-data/     # Insert data endpoint
│       │   ├── preview-table/   # Preview table data
│       │   ├── test-connection/ # Test DB connection
│       │   └── get-tables/      # List tables in database
│       └── excel/               # Excel operations
│           ├── analyze/         # Analyze Excel files
│           └── upload/          # Upload Excel files
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   └── ...                  # Other UI components
│   ├── database-connection-form.tsx
│   ├── database-connection-list.tsx
│   ├── excel-preview.tsx
│   ├── file-upload-zone.tsx
│   ├── sheet-selection-interface.tsx
│   ├── table-creation-interface.tsx  # ⭐ Intelligent configuration
│   ├── table-preview-interface.tsx
│   ├── results-dashboard.tsx
│   └── theme-provider.tsx
├── lib/                         # Core business logic
│   ├── database-manager.ts      # Database abstraction layer
│   ├── excel-parser.ts          # Excel file parsing
│   ├── data-type-detector.ts    # 🧠 Intelligent type detection
│   ├── data-transformer.ts      # Data transformation utilities
│   ├── data-cleaner.ts          # Data cleaning and validation
│   ├── connection-storage.ts    # Connection persistence
│   ├── operation-tracker.ts     # Operation history tracking
│   └── utils.ts                 # Utility functions
├── public/                      # Static assets
├── styles/                      # Additional styles
├── package.json                 # Dependencies
├── tsconfig.json               # TypeScript configuration
├── next.config.mjs             # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS configuration
└── README.md                   # This file
```

## 🎨 UI Components

Built with:
- **shadcn/ui** - High-quality React components
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide Icons** - Beautiful icon set
- **next-themes** - Dark mode support

## 🔧 Configuration

### Database Connection Storage

Connections are stored in `localStorage` with the following structure:
```typescript
interface DatabaseConfig {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'mssql' | 'sqlite'
  host: string
  port: number
  username: string
  password: string  // Stored securely in browser
  database: string
  ssl: boolean
}
```

### Data Type Detection

The system uses intelligent algorithms to detect:
- **Integers** (INT, BIGINT, TINYINT, SMALLINT)
- **Decimals** (DECIMAL, FLOAT, REAL)
- **Strings** (VARCHAR, TEXT, NVARCHAR)
- **Booleans** (BOOLEAN, BIT)
- **Dates** (DATE, DATETIME, DATETIME2, TIMESTAMP)
- **JSON** (JSON, JSONB)
- **Special types** (EMAIL, URL, UUID)

### Type Adaptation by Database

| Detected Type | PostgreSQL | MySQL | MSSQL | SQLite |
|--------------|------------|-------|-------|--------|
| Integer | INTEGER | INT | INT | INTEGER |
| Big Integer | BIGINT | BIGINT | BIGINT | INTEGER |
| Decimal | DECIMAL(10,2) | DECIMAL(10,2) | DECIMAL(10,2) | REAL |
| String (short) | VARCHAR(50) | VARCHAR(50) | NVARCHAR(50) | TEXT |
| String (long) | TEXT | TEXT | NVARCHAR(MAX) | TEXT |
| Boolean | BOOLEAN | BOOLEAN | BIT | INTEGER |
| Date | DATE | DATE | DATE | TEXT |
| DateTime | TIMESTAMP | DATETIME | DATETIME2 | TEXT |
| JSON | JSONB | JSON | NVARCHAR(MAX) | TEXT |

## 🚀 Deployment

### Build for Production

```bash
# Using pnpm
corepack pnpm build

# Or using npm
npm run build
```

### Start Production Server

```bash
# Using pnpm
corepack pnpm start

# Or using npm
npm start
```

### Environment Variables (Optional)

Create a `.env.local` file for environment-specific configuration:

```env
# Optional: Set custom ports
PORT=3000

# Optional: Database connection strings (if pre-configuring)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

## 🐛 Known Issues & Fixes

### Recent Fixes (v2.5)
- ✅ Fixed multiple table creation navigation bug
- ✅ Fixed table preview component data structure mismatch
- ✅ Fixed dark mode styling inconsistencies
- ✅ Fixed font consistency across interfaces
- ✅ Fixed null/undefined handling in row counts
- ✅ Fixed button state during table creation

See [MULTIPLE_TABLE_CREATION_FIX.md](MULTIPLE_TABLE_CREATION_FIX.md) for detailed fix documentation.

## 📝 API Endpoints

### Database Operations
- `POST /api/database/test-connection` - Test database connection
- `POST /api/database/create-table` - Create table with schema
- `POST /api/database/insert-data` - Insert data into table
- `POST /api/database/preview-table` - Preview table data (first 10 rows)
- `POST /api/database/get-tables` - List all tables in database

### Excel Operations
- `POST /api/excel/analyze` - Analyze Excel file structure
- `POST /api/excel/upload` - Upload and parse Excel files

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Test with multiple database types
- Ensure responsive design works on all screen sizes
- Follow the existing code style and conventions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Leptons1618**
- GitHub: [@Leptons1618](https://github.com/Leptons1618)

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React framework
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [xlsx](https://www.npmjs.com/package/xlsx) - Excel file parsing
- Database drivers: [pg](https://node-postgres.com/), [mysql2](https://www.npmjs.com/package/mysql2), [mssql](https://www.npmjs.com/package/mssql), [sqlite3](https://www.npmjs.com/package/sqlite3)

## 📊 Tech Stack

### Frontend
- **Framework**: Next.js 15.2.4 (App Router)
- **UI Library**: React 19.0.0
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS 4.1.9
- **Components**: Radix UI + shadcn/ui
- **Icons**: Lucide React
- **Theme**: next-themes

### Backend
- **Runtime**: Node.js ≥18
- **API**: Next.js API Routes
- **Databases**: PostgreSQL, MySQL, MSSQL, SQLite
- **Excel Parsing**: xlsx
- **Type Safety**: TypeScript with strict mode

### Development
- **Package Manager**: pnpm 10.15.0
- **Build Tool**: Next.js Compiler (Turbopack)
- **Linting**: ESLint
- **Type Checking**: TypeScript Compiler

## 🎯 Roadmap

### Planned Features
- [ ] Batch operations support (update, delete)
- [ ] CSV import/export
- [ ] Data transformation rules (custom mapping)
- [ ] Scheduled imports
- [ ] Import history and rollback
- [ ] Advanced filtering and search
- [ ] Column mapping templates
- [ ] Database schema migration tools
- [ ] RESTful API for programmatic access
- [ ] Cloud database support (AWS RDS, Azure SQL)
- [ ] Docker containerization
- [ ] Multi-user support with authentication

## 🔒 Security Notes

- Database credentials are stored in browser `localStorage`
- No server-side credential persistence
- SSL/TLS support for secure database connections
- Sanitized table and column names to prevent SQL injection
- Input validation on all forms

**⚠️ Important**: For production use, implement proper authentication and credential management.

## 💡 Tips & Best Practices

### Excel File Preparation
- Use clear, descriptive column headers in the first row
- Avoid merged cells
- Use consistent data formats within columns
- Remove unnecessary formatting
- Keep data types consistent within columns

### Database Performance
- Add indexes after bulk imports
- Use appropriate data types for better storage efficiency
- Consider table partitioning for large datasets
- Regular maintenance and optimization

### Common Workflows

**Single Sheet Import:**
1. Upload Excel file
2. Connect to database
3. Select sheet
4. Review auto-detected schema
5. Create table & insert data
6. Preview results

**Multi-Sheet Batch Import:**
1. Upload Excel file with multiple sheets
2. Connect to database
3. Select all relevant sheets
4. Configure tables in bulk
5. Create all tables at once
6. Review all table previews

## 🐞 Troubleshooting

### Connection Issues
- Verify database server is running
- Check firewall rules
- Ensure correct port numbers
- Verify credentials

### Import Errors
- Check Excel file format (.xlsx supported)
- Ensure data types are consistent
- Review column names (no special characters)
- Check for duplicate column names

### Performance Issues
- Reduce batch size for large files
- Create indexes after import
- Use appropriate data types
- Consider database server resources

## 📚 Documentation

Additional documentation:
- [API Routes Documentation](API_ROUTES.md)
- [Endpoints Summary](ENDPOINTS_SUMMARY.md)
- [Null Handling Fix](NULL_HANDLING_FIX.md)
- [Table Preview Fix](TABLE_PREVIEW_FIX.md)
- [Multiple Table Creation Fix](MULTIPLE_TABLE_CREATION_FIX.md)

---

<div align="center">

**Made with ❤️ by [Leptons1618](https://github.com/Leptons1618)**

⭐ Star this repo if you find it useful!

</div>
