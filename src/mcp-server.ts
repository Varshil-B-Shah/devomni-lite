// mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { PostgresAdapter } from "./postgresAdapter.js";

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

const db = new PostgresAdapter(process.env.PG_CONNECTION_STRING!);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_database",
        description: "Execute SQL queries on the PostgreSQL database",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "SQL query to execute",
            },
            params: {
              type: "array",
              description: "Query parameters",
              items: {
                type: "string",
              },
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "get_schema",
        description: "Get database schema information",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "query_database": {
          const { sql, params } = args as { sql: string; params?: string[] };
          const result = await db.query(sql, params);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.rows, null, 2),
              },
            ],
          };
        }

        case "get_schema": {
          const result = await db.query(
            `SELECT table_name, column_name, data_type 
           FROM information_schema.columns 
           WHERE table_schema='public' 
           ORDER BY table_name, ordinal_position`
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.rows, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

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
