# DevOmni Role-Based MCP Configuration

## Overview
DevOmni now has **role-based access control** with two specialized MCP servers:

### 🧠 Claude Desktop - Strategic Planning Agent
**Server**: `mcp-server-claude.js`
**Role**: Database analysis, intent processing, context creation

**Available Tools**:
- `get_database_schema` - Extract complete database schemas
- `export_schema_for_codegen` - Format schema for code generation
- `analyze_intent` - Process natural language requests
- `generate_preview` - Create code previews
- `create_workflow_context` - Store contexts for Copilot
- `list_contexts` - View all contexts
- `search_contexts` - Find specific contexts
- `get_context` - Retrieve context details

### 🤖 GitHub Copilot - Code Generation Agent  
**Server**: `mcp-server-copilot.js`
**Role**: Context consumption and actual code generation

**Available Tools** (Limited):
- `list_contexts` - View available contexts
- `search_contexts` - Find relevant contexts
- `get_context` - Read context created by Claude

**No Access To**:
- Database schemas
- Intent analysis
- Preview generation

## Configuration

### Claude Desktop
Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devomni-claude": {
      "command": "node",
      "args": ["C:\\path\\to\\devomni-lite\\dist\\mcp-server-claude.js"]
    }
  }
}
```

### GitHub Copilot (via VS Code)
Use the DevOmni extension command:
**"DevOmni: Setup MCP Integration for GitHub Copilot"**

This automatically creates `.vscode/mcp.json` pointing to `mcp-server-copilot.js`

## Workflow

1. **Claude Desktop** analyzes database schema and user intent
2. **Claude Desktop** creates workflow context with analysis
3. **GitHub Copilot** reads the context 
4. **GitHub Copilot** generates actual code files

Perfect separation of concerns! 🎯