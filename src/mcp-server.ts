// mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

import { PostgresAdapter } from "./postgresAdapter.js";
import { MySQLAdapter } from './mysqlAdapter.js';


const server = new Server(
  {
    name: "devomni-postgres",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const pgDb = new PostgresAdapter(process.env.PG_CONNECTION_STRING!);
const mysqlDb = new MySQLAdapter({
  host: process.env.MYSQL_HOST!,
  port: Number(process.env.MYSQL_PORT!),
  user: process.env.MYSQL_USER!,
  password: process.env.MYSQL_PASSWORD!,
  database: process.env.MYSQL_DATABASE!
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_postgres',
        description: 'Execute SQL queries on PostgreSQL',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'SQL query' },
            params: { type: 'array', items: { type: 'string' }, description: 'Query parameters' }
          },
          required: ['sql'],
        },
      },
      {
        name: 'query_mysql',
        description: 'Execute SQL queries on MySQL',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'SQL query' },
            params: { type: 'array', items: { type: 'string' }, description: 'Query parameters' }
          },
          required: ['sql'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'query_postgres': {
        const { sql, params } = args as { sql: string; params?: string[] };
        const result = await pgDb.query(sql, params);
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }
      case 'query_mysql': {
        const { sql, params } = args as { sql: string; params?: string[] };
        const result = await mysqlDb.query(sql, params);
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
  }
});


// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Devomni MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
