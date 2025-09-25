# DevOmni Lite MCP Server + VS Code Extension

**Date:** September 26, 2025

## 🌟 **NEW: AI-Powered Code Generation Extension**

DevOmni Lite now includes a **VS Code extension** that works with **GitHub Copilot** to generate complete APIs from your database schemas! 

**Workflow**: Claude Desktop ←→ DevOmni MCP ←→ VS Code Extension ←→ GitHub Copilot

## Overview
DevOmni Lite is a **secure** Model Context Protocol (MCP) server that enables AI tools and LLMs (like Claude Desktop) to safely query multiple database types through a unified interface. Now enhanced with **automatic code generation capabilities** through our VS Code extension.

## 🚀 **What's New**

### **AI Code Generation**
- **🤖 GitHub Copilot Integration**: Just ask "Generate APIs for users table" and get complete API code
- **📋 Multi-Framework Support**: Next.js, Express, NestJS, FastAPI, and more
- **⚡ Smart Schema Caching**: Automatic schema synchronization and caching
- **🔄 Real-time Updates**: Schema stays in sync with your database changes

### **Enhanced MCP Tools**
- **`get_database_schema`**: Extract complete table structures and relationships
- **`list_database_tables`**: Get all tables with optional row counts  
- **`export_schema_for_codegen`**: Schema optimized for AI code generation

## 🛡️ Security Features
- **🔒 Input Validation**: Comprehensive Zod-based runtime validation
- **🚫 Injection Protection**: Blocks SQL injection and NoSQL injection attacks
- **🛑 Dangerous Operators**: Prevents MongoDB JavaScript execution (`$where`, `$eval`, etc.)
- **🔍 Path Traversal Prevention**: Collection name sanitization and validation
- **📊 Security Monitoring**: Detailed logging of all security events
- **✅ Parameterized Queries**: Safe SQL execution for PostgreSQL and MySQL

## Features
- **MCP-compliant server:** Communicates via stdin/stdout for seamless LLM integration
- **Multi-database support:** PostgreSQL, MySQL, and MongoDB with unified interface
- **Secure database access:** Connection pooling with security configurations
- **AI Code Generation:** VS Code extension for automatic API generation
- **Schema extraction:** Advanced database schema analysis for code generation
- **Registered tools:**
  - `unified_query`: Query any database (Postgres, MySQL, MongoDB) with security validation
  - `compare_databases`: Compare results between two different databases safely
  - `get_database_schema`: Extract complete database schema for AI code generation
  - `list_database_tables`: List all tables/collections with metadata
  - `export_schema_for_codegen`: Export schema optimized for AI code generation
- **Comprehensive error handling:** Clear, secure error messages
- **Security testing:** Built-in security test suite

## 🎯 **Quick Start with Code Generation**

### **1. Setup DevOmni MCP Server**
```bash
# Clone and install
git clone <repo-url>
cd devomni-lite
npm install

# Configure database
echo "PG_CONNECTION_STRING=postgresql://user:password@host:5432/db" > .env

# Build and start
npm run build
npm start  # MCP server for Claude Desktop

# Also start HTTP server for VS Code extension
node dist/server.js  # HTTP server on port 3000
```

### **2. Install VS Code Extension**
```bash
cd extension
npm install
npm run compile

# Install in VS Code (or from marketplace when published)
code --install-extension ./devomni-codegen-0.1.0.vsix
```

### **3. Configure VS Code**
```json
{
  "devomni.mcpServerUrl": "http://localhost:3000",
  "devomni.database": "postgres",
  "devomni.targetFramework": "nextjs"
}
```

### **4. Generate APIs with AI**
1. **Command Palette** → `DevOmni: Refresh Database Schema`
2. **Ask GitHub Copilot**: "Generate CRUD APIs for users table"
3. **Watch magic happen**: Complete API files created automatically!

## 🔄 **Dual Interface Architecture**

### **For AI Chat (Claude Desktop)**
```
Claude Desktop ←→ DevOmni MCP Server (stdio)
├── Database exploration
├── Complex queries  
├── Data analysis
└── Schema inspection
```

### **For Code Generation (VS Code)**
```
VS Code Extension ←→ DevOmni HTTP Server (port 3000) ←→ GitHub Copilot
├── Schema caching
├── API generation
├── Type generation
└── CRUD creation
```

## Getting Started (Traditional MCP Setup)
1. **Clone the repo**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure your databases:**
   - Add your database connection details to a `.env` file:
     ```env
     PG_CONNECTION_STRING=postgresql://<user>:<password>@<host>:5432/<db>
     MYSQL_HOST=localhost
     MYSQL_PORT=3306
     MYSQL_USER=user
     MYSQL_PASSWORD=password
     MYSQL_DATABASE=database
     MONGODB_URI=mongodb://localhost:27017
     MONGODB_DATABASE=database
     ```
4. **Build the project:**
   ```bash
   npm run build
   ```
5. **Run security tests:**
   ```bash
   npm test
   ```
6. **Run the MCP server:**
   ```bash
   npm start
   ```
7. **Integrate with Claude Desktop or any MCP client**

## 🗂️ Filesystem Integration (Optional)
Enable Claude to access and manage your local files or Obsidian notes for advanced automation and persistent memory.

### How to Enable Filesystem MCP Server
1. **Open Claude Desktop → Settings → Developer → Edit Config.**
2. **Add or update the `mcpServers` section in your `claude_desktop_config.json`:**
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-filesystem",
           "/Users/yourusername/Desktop",
           "/Users/yourusername/Downloads"
         ]
       }
     }
   }
   ```
   - Replace `yourusername` with your actual computer username.
   - Add or remove directory paths as needed. Each path after the package name is a folder Claude can access.
3. **Save and restart Claude Desktop.**
4. **Test with prompts like:**
   - "List all Markdown files in my Documents folder."
   - "Summarize the contents of 'project_notes.txt' on my Desktop."
   - "Organize all images on my Desktop into a new folder called 'Images'."

**Security Note:** Only grant access to directories you’re comfortable with Claude reading and modifying. The server runs with your user account permissions, so it can perform any file operations you can perform manually. All file actions require your approval.

## ☁️ Notion Integration (Optional)
Enable Claude to automate and manage your Notion workspace for project management, notes, and cloud productivity.

### How to Enable Notion MCP Server
1. **Create a Notion integration and get your API token:**
   - Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and create a new integration.
   - Copy the secret token (starts with `ntn_`).
2. **Share Notion pages/databases with your integration:**
   - In Notion, open the page/database, click the three dots, go to Connections, and add your integration.
3. **Add the Notion MCP server to your Claude Desktop config:**
   ```json
   {
     "mcpServers": {
       "notionApi": {
         "command": "npx",
         "args": ["-y", "@notionhq/notion-mcp-server"],
         "env": {
           "NOTION_TOKEN": "ntn_your_secret_token_here"
         }
       }
     }
   }
   ```
   - Replace `ntn_your_secret_token_here` with your actual Notion integration token.
4. **Save and restart Claude Desktop.**
5. **Test with prompts like:**
   - "List all my Notion databases."
   - "Find the page titled 'Project Roadmap' and summarize it."
   - "Create a new note in my 'Ideas' database."

**Security Note:** Only share pages/databases you want Claude to access. Review and approve each action Claude requests. You can always remove the integration or revoke access in Notion's settings.

## 🧪 Security Testing
Run the comprehensive Jest security test suite to validate all protections:
```bash
npm test
```
For additional testing options:
```bash
npm run test:coverage    # Run tests with coverage report
npm run test:watch       # Run tests in watch mode
```

## Architecture
- **MCP Server:** Built with [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- **Security Layer:** Zod-based input validation with comprehensive attack prevention
- **Database Adapters:** 
  - PostgreSQL: [`pg`](https://node-postgres.com/) with connection pooling
  - MySQL: [`mysql2`](https://github.com/sidorares/node-mysql2) with secure configurations
  - MongoDB: [`mongodb`](https://mongodb.github.io/node-mongodb-native/) with injection protection
- **Tool Registration:** Follows [MCP tool schema conventions](https://modelcontextprotocol.io/docs/sdk)

## 🔒 Security Documentation
For detailed security information, see [SECURITY.md](./SECURITY.md)

## References & Learning Resources
- [Model Context Protocol (MCP) Overview](https://github.com/modelcontextprotocol)
- [Reference MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs/sdk)
- [Zod Validation Library](https://zod.dev/)
- [Connect to Local MCP Servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Notion MCP Integration Guide](https://www.getclockwise.com/blog/claude-notion-mcp-integration)

## Scripts
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run the MCP server
- `npm test` - Run Jest security test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode

***

*DevOmni Lite combines the power of multi-database access with enterprise-grade security, making it safe for AI-assisted database operations. Now with optional filesystem and Notion integration for AI-powered file and cloud workspace management.*
