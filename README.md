# DevOmni Lite MCP Server

**Date:** September 25, 2025

## Overview
DevOmni Lite is a **secure** Model Context Protocol (MCP) server that enables AI tools and LLMs (like Claude Desktop) to safely query multiple database types through a unified interface. This project features robust input validation, injection protection, and comprehensive security monitoring.

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
- **Registered tools:**
  - `unified_query`: Query any database (Postgres, MySQL, MongoDB) with security validation
  - `compare_databases`: Compare results between two different databases safely
- **Comprehensive error handling:** Clear, secure error messages
- **Security testing:** Built-in security test suite
- **Filesystem integration (optional):** Claude can access, search, and organize your local files or Obsidian vaults via the Filesystem MCP server for AI-powered file management and persistent memory.

## Getting Started
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
           "C:/Users/YourUsername/Desktop",
           "C:/Users/YourUsername/Documents"
         ]
       }
     }
   }
   ```
   - Replace `YourUsername` with your actual username (on Mac, use `/Users/yourusername/Desktop`, etc.).
   - Add or remove directory paths as needed. Each path after the package name is a folder Claude can access.
3. **Save and restart Claude Desktop.**
4. **Test with prompts like:**
   - "List all Markdown files in my Documents folder."
   - "Summarize the contents of 'project_notes.txt' on my Desktop."
   - "Organize all images on my Desktop into a new folder called 'Images'."

**Security Note:** Only expose folders you trust Claude with. Claude can read, write, and delete files in these directories. All file actions require your approval.

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

## Scripts
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run the MCP server
- `npm test` - Run Jest security test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode

***

*DevOmni Lite combines the power of multi-database access with enterprise-grade security, making it safe for AI-assisted database operations. Now with optional filesystem integration for AI-powered file management and persistent memory.*
