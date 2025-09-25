# DevOmni Code Generator Extension

AI-powered API generation using database schemas from DevOmni MCP server.

## Features

- **🔄 Automatic Schema Sync**: Connects to DevOmni MCP server to fetch latest database schemas
- **🚀 AI-Powered Code Generation**: Works with GitHub Copilot to generate APIs based on your database structure
- **📋 Multiple Framework Support**: Generate code for Next.js, Express, NestJS, FastAPI, and more
- **⚡ Smart Caching**: Local schema caching for better performance
- **🛠️ CRUD Generation**: Generate complete CRUD operations for any table
- **📝 TypeScript Types**: Automatic TypeScript interface generation from database schemas

## How It Works

```
DevOmni MCP Server ←→ VS Code Extension ←→ GitHub Copilot
```

1. **Extension connects** to your DevOmni MCP server
2. **Fetches database schema** and caches it locally
3. **You ask Copilot** to "generate APIs for users table"
4. **Copilot reads schema** and generates complete API code
5. **Files are created** automatically in your workspace

## Quick Start

### Prerequisites

1. **DevOmni MCP server** running (see main README)
2. **VS Code** with **GitHub Copilot** extension
3. **Database** configured (PostgreSQL, MySQL, or MongoDB)

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "DevOmni Code Generator" (when published)
4. Install the extension

### Configuration

Open VS Code settings and configure:

```json
{
  "devomni.mcpServerUrl": "http://localhost:3000",
  "devomni.database": "postgres", // or "mysql", "mongo"
  "devomni.targetFramework": "nextjs", // or "express", "nestjs", etc.
  "devomni.autoRefreshSchema": true
}
```

### Usage

1. **Open Command Palette** (Ctrl+Shift+P)
2. **Run**: `DevOmni: Refresh Database Schema`
3. **Ask GitHub Copilot**: 
   - "Generate CRUD APIs for users table"
   - "Create TypeScript types for all tables"
   - "Generate Next.js API routes"

## Commands

- **DevOmni: Generate APIs from Database Schema** - Generate complete API structure
- **DevOmni: Refresh Database Schema** - Sync latest schema from database
- **DevOmni: Show Database Schema** - View cached schema
- **DevOmni: Generate CRUD APIs for Table** - Generate CRUD for specific table
- **DevOmni: Generate TypeScript Types** - Create type definitions

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `devomni.mcpServerUrl` | DevOmni MCP server URL | `http://localhost:3000` |
| `devomni.database` | Database type | `postgres` |
| `devomni.targetFramework` | Target framework for code generation | `nextjs` |
| `devomni.autoRefreshSchema` | Auto-refresh schema on startup | `true` |
| `devomni.schemaCache.enabled` | Enable local caching | `true` |
| `devomni.schemaCache.ttl` | Cache TTL in milliseconds | `300000` (5 min) |

## Generated Files

### Next.js Example
```
app/api/users/route.ts          # GET, POST endpoints
app/api/users/[id]/route.ts     # GET, PUT, DELETE endpoints
types/database.ts               # TypeScript interfaces
lib/database.ts                 # Database utilities
```

### Express Example
```
routes/users.ts                 # User routes
routes/index.ts                 # Main router
types/database.ts               # TypeScript interfaces
```

## Example Workflow

1. **Setup Database**:
   ```sql
   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     email VARCHAR(255) NOT NULL,
     name VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **Refresh Schema**:
   - Command Palette → "DevOmni: Refresh Database Schema"

3. **Generate APIs**:
   - Chat with Copilot: "Generate CRUD APIs for users table"
   - Copilot creates complete API endpoints with validation

4. **Generated Code**:
   ```typescript
   // app/api/users/route.ts
   export async function GET(request: NextRequest) {
     // Complete implementation with pagination, error handling
   }
   
   export async function POST(request: NextRequest) {
     // Complete implementation with validation
   }
   ```

## Schema Caching

The extension automatically caches database schemas for better performance:

```
.devomni/
├── postgres-schema.json       # Full schema cache
├── postgres-tables.json       # Quick table reference
└── metadata.json              # Cache metadata
```

## Troubleshooting

### Extension not connecting to MCP server
- Ensure DevOmni MCP server is running on configured URL
- Check `devomni.mcpServerUrl` setting
- Verify database connections in MCP server

### Schema not refreshing
- Run "DevOmni: Refresh Database Schema" manually
- Check database permissions
- Verify environment variables in MCP server

### Generated code has errors
- Ensure target framework is correctly set
- Check database schema for missing constraints
- Update TypeScript types manually if needed

## Development

To contribute to this extension:

```bash
cd extension
npm install
npm run compile
```

## Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: See main DevOmni README
- **Community**: Join our Discord server