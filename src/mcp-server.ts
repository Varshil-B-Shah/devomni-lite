import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

import { PostgresAdapter } from "./postgresAdapter.js";
import { MySQLAdapter } from "./mysqlAdapter.js";
import { MongoAdapter } from "./mongoAdapter.js";

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
  database: process.env.MYSQL_DATABASE!,
});

const mongoDb = new MongoAdapter(
  process.env.MONGODB_URI!,
  process.env.MONGODB_DATABASE!
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_postgres",
        description: "Execute SQL queries on PostgreSQL",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "SQL query" },
            params: {
              type: "array",
              items: { type: "string" },
              description: "Query parameters",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "query_mysql",
        description: "Execute SQL queries on MySQL",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "SQL query" },
            params: {
              type: "array",
              items: { type: "string" },
              description: "Query parameters",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "find_mongo",
        description: "Query documents in a MongoDB collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: { type: "object", description: "MongoDB filter (JSON)" },
            projection: {
              type: "object",
              description: "Fields to include/exclude",
            },
          },
          required: ["collection"],
        },
      },
      {
        name: "insert_mongo",
        description: "Insert a document into a MongoDB collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            document: { type: "object", description: "Document to insert" },
          },
          required: ["collection", "document"],
        },
      },
      {
        name: "update_mongo",
        description: "Update documents in a MongoDB collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: {
              type: "object",
              description: "Filter for documents to update",
            },
            update: {
              type: "object",
              description:
                "Update operations (e.g., { $set: { field: value } })",
            },
          },
          required: ["collection", "filter", "update"],
        },
      },
      {
        name: "delete_mongo",
        description: "Delete documents from a MongoDB collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: {
              type: "object",
              description: "Filter for documents to delete",
            },
          },
          required: ["collection", "filter"],
        },
      },
      {
        name: "list_mongo_collections",
        description: "List collections in the current MongoDB database",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "query_postgres": {
          const { sql, params } = args as { sql: string; params?: string[] };
          const result = await pgDb.query(sql, params);
          return {
            content: [
              { type: "text", text: JSON.stringify(result.rows, null, 2) },
            ],
          };
        }
        case "query_mysql": {
          const { sql, params } = args as { sql: string; params?: string[] };
          const result = await mysqlDb.query(sql, params);
          return {
            content: [
              { type: "text", text: JSON.stringify(result.rows, null, 2) },
            ],
          };
        }
        case "find_mongo": {
          const { collection, filter, projection } = args as any;
          const rows = await mongoDb.find(collection, filter, projection);
          return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
          };
        }
        case "insert_mongo": {
          const { collection, document } = args as any;
          const result = await mongoDb.insert(collection, document);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "update_mongo": {
          const { collection, filter, update } = args as any;
          const result = await mongoDb.update(collection, filter, update);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "delete_mongo": {
          const { collection, filter } = args as any;
          const result = await mongoDb.delete(collection, filter);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "list_mongo_collections": {
          const names = await mongoDb.listCollections();
          return {
            content: [{ type: "text", text: JSON.stringify(names, null, 2) }],
          };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Devomni MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
