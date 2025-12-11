# DevOmni Code Generator Extension

AI-powered API generation using database schemas from DevOmni MCP server.

## Features

- **🔄 Automatic Schema Sync**: Connects to DevOmni MCP server to fetch latest database schemas
- **🚀 AI-Powered Code Generation**: Works with GitHub Copilot to generate APIs based on your database structure
- **📋 Multiple Framework Support**: Generate code for Next.js, Express, NestJS, FastAPI, and more
- **⚡ Smart Caching**: Local schema caching for better performance
- **🛠️ CRUD Generation**: Generate complete CRUD operations for any table
- **📝 TypeScript Types**: Automatic TypeScript interface generation from database schemas
- **🌐 Cross-Workspace Support**: Works globally across all VS Code workspaces
- **⚙️ One-Click MCP Setup**: Automatic GitHub Copilot MCP integration
- **📊 Profile Management**: Switch between multiple database configurations
- **🎯 Context Management**: Share workflow contexts across workspaces

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

1. **Download/Build** the extension (.vsix file)
2. **Install in VS Code**:
   ```bash
   code --install-extension ./devomni-codegen-0.1.0.vsix
   ```
3. **Configure Extension Path**:
   - Copy `config.json.example` to `config.json`
   - Update `devomniProjectRoot` with your DevOmni installation path

### One-Click Setup

1. **Open ANY workspace** in VS Code
2. **Command Palette** (Ctrl+Shift+P) → `DevOmni: Setup MCP Integration for GitHub Copilot`
3. **Restart VS Code** when prompted
4. **Done!** GitHub Copilot now has DevOmni tools **globally across all workspaces**

### Usage

1. **Open Command Palette** (Ctrl+Shift+P)
2. **Run**: `DevOmni: Refresh Database Schema`
3. **Ask GitHub Copilot**: 
   - "List available workflow contexts"
   - "Generate CRUD APIs for users table"
   - "Create TypeScript types for all tables"
   - "Get context details for my project"

## 🌐 Global Workspace Support

Once set up, DevOmni works **across ALL VS Code workspaces**:
- **No per-workspace configuration** needed
- **Shared contexts** between projects
- **Centralized schema** and profile management
- **One extension installation** serves multiple projects

## Commands

### **Setup & Configuration**
- **DevOmni: Setup MCP Integration for GitHub Copilot** - 🎯 One-click global MCP setup
- **DevOmni: Setup Project Configuration** - Configure database connections and profiles

### **Code Generation**
- **DevOmni: Generate APIs from Database Schema** - Generate complete API structure
- **DevOmni: Refresh Database Schema** - Sync latest schema from database
- **DevOmni: Show Database Schema** - View cached schema
- **DevOmni: Generate CRUD APIs for Table** - Generate CRUD for specific table
- **DevOmni: Generate TypeScript Types** - Create type definitions

### **Context Management**
- **DevOmni: List Available Workflow Contexts** - Browse contexts created by Claude Desktop
- **DevOmni: Search Workflow Contexts** - Find contexts by keywords
- **DevOmni: Get Workflow Context** - Retrieve specific context details
- **DevOmni: Create New Workflow Context** - Create contexts for AI generation

### **Profile Management**
- **DevOmni: List Database Profiles** - View and switch between database configurations
- **DevOmni: Create Profile** - Add new database connection profiles
- **DevOmni: Switch Profile** - Change active database profile
- **DevOmni: Delete Profile** - Remove database profiles
- **DevOmni: Test Database Connection** - Verify database connectivity

## Configuration

### **Extension Configuration (config.json)**
```json
{
  "devomniProjectRoot": "C:\\path\\to\\your\\devomni\\installation"
}
```

### **VS Code Settings (Optional)**
| Setting | Description | Default |
|---------|-------------|---------|
| `devomni.mcpServerUrl` | DevOmni HTTP server URL | `http://localhost:3000` |
| `devomni.database` | Database type | `postgres` |
| `devomni.targetFramework` | Target framework for code generation | `nextjs` |
| `devomni.autoRefreshSchema` | Auto-refresh schema on startup | `true` |
| `devomni.schemaCache.enabled` | Enable local caching | `true` |
| `devomni.schemaCache.ttl` | Cache TTL in milliseconds | `300000` (5 min) |

### **MCP Server Configuration (Automatic)**
After running "Setup MCP Integration", your workspace will have:
```json
{
  "github.copilot.chat.mcp.servers": {
    "devomni": {
      "command": "node",
      "args": ["C:\\path\\to\\devomni\\dist\\mcp-server-copilot.js"]
    }
  }
}
```

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

### MCP Integration not working
- Run "DevOmni: Setup MCP Integration for GitHub Copilot" command
- Restart VS Code after setup
- Check that `config.json` has correct `devomniProjectRoot` path

### Extension not connecting to DevOmni
- Ensure DevOmni HTTP server is running (`node dist/server.js`)
- Check `devomni.mcpServerUrl` setting (default: http://localhost:3000)
- Verify `config.json` has correct DevOmni installation path

### GitHub Copilot can't see DevOmni tools
- Ensure MCP integration is set up (run setup command)
- Restart VS Code completely
- Check VS Code settings for `github.copilot.chat.mcp.servers.devomni`

### Contexts not shared across workspaces
- Verify all workspaces point to same DevOmni installation
- Check `DEVOMNI_PROJECT_ROOT` environment variable
- Ensure contexts exist in the centralized `.devomni` folder

### Schema not refreshing
- Run "DevOmni: Refresh Database Schema" manually
- Check database permissions and connections
- Verify active profile has correct database configuration

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