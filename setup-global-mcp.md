# Global DevOmni MCP Server Setup

## For Claude Desktop (Global Configuration)

1. **Edit Claude Desktop config** at:
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. **Add DevOmni MCP server**:
   ```json
   {
     "mcpServers": {
       "devomni-global": {
         "command": "node",
         "args": ["C:\\Users\\Varshil\\Desktop\\MyWebApps\\devomni-lite\\dist\\mcp-server.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop** - now ALL your Claude conversations can access DevOmni contexts!

## For VS Code Extensions (Per-Project)

**Option A: Install DevOmni Extension**
1. Package the extension: `vsce package` in the extension folder
2. Install in VS Code: `code --install-extension devomni-0.0.1.vsix`
3. Configure MCP server URL in settings

**Option B: Manual MCP Client (Simpler)**
Add this to any project's `package.json`:

```json
{
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0"
  }
}
```

Then create `mcp-client.js`:

```javascript
const axios = require('axios');

class DevOmniClient {
    constructor() {
        this.baseUrl = 'http://localhost:3000'; // Your MCP server
    }

    async listContexts() {
        const response = await axios.post(`${this.baseUrl}/mcp-tool`, {
            toolName: 'list_contexts',
            arguments: {}
        });
        return response.data;
    }

    async getContext(contextName) {
        const response = await axios.post(`${this.baseUrl}/mcp-tool`, {
            toolName: 'get_context', 
            arguments: { context_name: contextName }
        });
        return response.data;
    }
}

module.exports = { DevOmniClient };
```

## HTTP Server Mode (Universal Access)

**Start DevOmni in HTTP mode:**
```bash
cd C:\Users\Varshil\Desktop\MyWebApps\devomni-lite
npm run start:http
```

Now ANY project can access contexts via HTTP:
```javascript
// In any project anywhere
const response = await fetch('http://localhost:3000/mcp-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        toolName: 'list_contexts',
        arguments: {}
    })
});
const contexts = await response.json();
```