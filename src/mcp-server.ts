// Import MCP SDK and transports
import { Server } from "@modelcontextprotocol/sdk/server/index.js"; // Main MCP server class
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; // For local stdio transport
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"; // Tool schemas
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

// Import your database adapters
import { PostgresAdapter } from "./postgresAdapter.js";
import { MySQLAdapter } from "./mysqlAdapter.js";
import { MongoAdapter } from "./mongoAdapter.js";

// Load environment variables (assume dotenv is set up elsewhere)

// Initialize database adapters with config from .env
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

function formatResult(result: any): string {
  // If result is an array (MongoDB), just stringify it
  if (Array.isArray(result)) {
    return JSON.stringify(result, null, 2);
  }
  // If result has a .rows property (Postgres/MySQL), use that
  if (result && typeof result === "object" && "rows" in result) {
    return JSON.stringify(result.rows, null, 2);
  }
  // Fallback: stringify the whole result
  return JSON.stringify(result, null, 2);
}

// Create the MCP server
const server = new Server(
  {
    name: "devomni-unified",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools (unified_query and compare_databases)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "unified_query",
        description:
          "Query any database (Postgres, MySQL, MongoDB) with a single tool",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to query",
            },
            query: {
              type: "string",
              description:
                "SQL query (for Postgres/MySQL) or ignored for MongoDB",
            },
            collection: {
              type: "string",
              description: "MongoDB collection name (Mongo only)",
            },
            filter: {
              type: "object",
              description: "MongoDB filter (Mongo only)",
            },
            projection: {
              type: "object",
              description: "MongoDB projection (Mongo only)",
            },
          },
          required: ["database"],
        },
      },
      {
        name: "compare_databases",
        description:
          "Compare results from two databases (Postgres, MySQL, MongoDB)",
        inputSchema: {
          type: "object",
          properties: {
            db1: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "First database",
            },
            db2: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Second database",
            },
            query1: {
              type: "string",
              description: "SQL or MongoDB query for db1",
            },
            query2: {
              type: "string",
              description: "SQL or MongoDB query for db2",
            },
            collection1: {
              type: "string",
              description: "Collection for db1 (Mongo only)",
            },
            collection2: {
              type: "string",
              description: "Collection for db2 (Mongo only)",
            },
            filter1: {
              type: "object",
              description: "Filter for db1 (Mongo only)",
            },
            filter2: {
              type: "object",
              description: "Filter for db2 (Mongo only)",
            },
          },
          required: ["db1", "db2"],
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
        case "unified_query": {
          // Route to the correct database adapter
          const { database, query, collection, filter, projection } =
            args as any;
          if (database === "postgres") {
            const result = await pgDb.query(query);
            return {
              content: [
                { type: "text", text: JSON.stringify(result.rows, null, 2) },
              ],
            };
          } else if (database === "mysql") {
            const result = await mysqlDb.query(query);
            return {
              content: [
                { type: "text", text: JSON.stringify(result.rows, null, 2) },
              ],
            };
          } else if (database === "mongo") {
            const rows = await mongoDb.find(collection, filter, projection);
            return {
              content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
            };
          } else {
            throw new Error("Unknown database type");
          }
        }
        case "compare_databases": {
          const {
            db1,
            db2,
            query1,
            query2,
            collection1,
            collection2,
            filter1,
            filter2,
          } = args as any;
          let result1, result2;
          // Query first database
          if (db1 === "postgres") {
            result1 = await pgDb.query(query1);
          } else if (db1 === "mysql") {
            result1 = await mysqlDb.query(query1);
          } else if (db1 === "mongo") {
            result1 = await mongoDb.find(collection1, filter1);
          }
          // Query second database
          if (db2 === "postgres") {
            result2 = await pgDb.query(query2);
          } else if (db2 === "mysql") {
            result2 = await mysqlDb.query(query2);
          } else if (db2 === "mongo") {
            result2 = await mongoDb.find(collection2, filter2);
          }
          // Safely handle possibly undefined results
          return {
            content: [
              {
                type: "text",
                text: "Result from " + db1 + ":\n" + formatResult(result1),
              },
              {
                type: "text",
                text: "Result from " + db2 + ":\n" + formatResult(result2),
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
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// Start the MCP server (stdio transport for local use)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Devomni Unified MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
