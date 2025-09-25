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
import { 
  UnifiedQuerySchema, 
  CompareDatabasesSchema, 
  validateInput,
  logSecurityEvent 
} from "./inputValidator.js";

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
  if (Array.isArray(result)) {
    return JSON.stringify(result, null, 2);
  }
  if (result && typeof result === "object" && "rows" in result) {
    return JSON.stringify(result.rows, null, 2);
  }
  return JSON.stringify(result, null, 2);
}

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

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case "unified_query": {
          // Security: Validate input using Zod schema
          const validatedArgs = validateInput(UnifiedQuerySchema, args);
          const { database, query, collection, filter, projection } = validatedArgs;
          
          // Log the query attempt for security monitoring
          logSecurityEvent("unified_query_attempt", {
            database,
            hasQuery: !!query,
            hasCollection: !!collection,
            hasFilter: !!filter && Object.keys(filter).length > 0,
            hasProjection: !!projection && Object.keys(projection).length > 0
          });

          if (database === "postgres") {
            const result = await pgDb.query(query!);
            return {
              content: [
                { type: "text", text: JSON.stringify(result.rows, null, 2) },
              ],
            };
          } else if (database === "mysql") {
            const result = await mysqlDb.query(query!);
            return {
              content: [
                { type: "text", text: JSON.stringify(result.rows, null, 2) },
              ],
            };
          } else if (database === "mongo") {
            const rows = await mongoDb.find(collection!, filter, projection);
            return {
              content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
            };
          } else {
            throw new Error("Unknown database type");
          }
        }
        case "compare_databases": {
          // Security: Validate input using Zod schema
          const validatedArgs = validateInput(CompareDatabasesSchema, args);
          const {
            db1,
            db2,
            query1,
            query2,
            collection1,
            collection2,
            filter1,
            filter2,
          } = validatedArgs;
          
          // Log the comparison attempt for security monitoring
          logSecurityEvent("compare_databases_attempt", {
            db1,
            db2,
            hasQuery1: !!query1,
            hasQuery2: !!query2,
            hasCollection1: !!collection1,
            hasCollection2: !!collection2
          });

          let result1, result2;
          if (db1 === "postgres") {
            result1 = await pgDb.query(query1!);
          } else if (db1 === "mysql") {
            result1 = await mysqlDb.query(query1!);
          } else if (db1 === "mongo") {
            result1 = await mongoDb.find(collection1!, filter1);
          }
          if (db2 === "postgres") {
            result2 = await pgDb.query(query2!);
          } else if (db2 === "mysql") {
            result2 = await mysqlDb.query(query2!);
          } else if (db2 === "mongo") {
            result2 = await mongoDb.find(collection2!, filter2);
          }
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Log security-related errors
      if (errorMessage.includes("Security:") || errorMessage.includes("Input validation failed")) {
        logSecurityEvent("validation_error", {
          tool: name,
          error: errorMessage,
          args: args
        });
      }
      
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
  console.error("Devomni Unified MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
