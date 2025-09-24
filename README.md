# DevOmni Lite MCP Server

**Date:** September 24, 2025

## Overview
DevOmni Lite is a Model Context Protocol (MCP) server that enables AI tools and LLMs (like Claude Desktop) to securely query and inspect PostgreSQL databases using standardized MCP tools. This project is built with TypeScript and the official MCP SDK for rapid integration and extensibility.

## Features
- **MCP-compliant server:** Communicates via stdin/stdout for seamless LLM integration
- **PostgreSQL adapter:** Secure, pooled database access
- **Registered tools:**
  - `query_database`: Run SQL queries on your database
  - `get_schema`: Inspect table and column metadata
- **Error handling:** Clear error messages for failed queries
- **Easy extension:** Add more tools or database adapters as needed

## Getting Started
1. **Clone the repo**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure your database:**
   - Add your PostgreSQL connection string to a `.env` file:
     ```env
     PG_CONNECTION_STRING=postgresql://<user>:<password>@<host>:5432/<db>
     ```
4. **Build the project:**
   ```bash
   npm run build
   ```
5. **Run the MCP server:**
   ```bash
   npm start
   ```
6. **Integrate with Claude Desktop or any MCP client**

## Architecture
- **MCP Server:** Built with [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- **Database Adapter:** Uses [`pg`](https://node-postgres.com/) for PostgreSQL
- **Tool Registration:** Follows [MCP tool schema conventions](https://modelcontextprotocol.io/docs/sdk)

## References & Learning Resources
- [Model Context Protocol (MCP) Overview](https://github.com/modelcontextprotocol)[2]
- [Reference MCP Servers](https://github.com/modelcontextprotocol/servers)[1]
- [Awesome MCP Servers List](https://github.com/punkpeye/awesome-mcp-servers)[3]
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs/sdk)[2]
- [MCP Server Example](https://github.com/alejandro-ao/mcp-server-example)[5]

## Next Steps
- Add more database adapters (MySQL, MongoDB)
- Expose tools as a web API (Express)
- Implement authentication and access controls

***

*DevOmni Lite is inspired by the open MCP ecosystem and aims to make developer data access safer, smarter, and more extensible.*
