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
import { OllamaService } from "./ollamaService.js";
import { 
  UnifiedQuerySchema, 
  CompareDatabasesSchema, 
  AIValidationRequestSchema,
  CLIGenerationRequestSchema,
  SchemaAnalysisRequestSchema,
  GitOperationRequestSchema,
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

// EXPLANATION: Initialize AI service for validation
// This connects to local Ollama server for AI validation
const aiService = new OllamaService();

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
      // NEW AI-POWERED TOOLS START HERE
      {
        name: "ai_validate_operation",
        description: "Use AI to validate database operations for safety before execution",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database the operation targets"
            },
            operationType: {
              type: "string", 
              enum: ["query", "schema_change", "data_modification"],
              description: "Type of operation to validate"
            },
            query: {
              type: "string",
              description: "SQL query (for Postgres/MySQL)"
            },
            collection: {
              type: "string", 
              description: "MongoDB collection name (Mongo only)"
            },
            operation: {
              type: "object",
              description: "MongoDB operation object (Mongo only)"
            },
            requiresApproval: {
              type: "boolean",
              description: "Whether operation requires AI approval",
              default: true
            }
          },
          required: ["database", "operationType"]
        }
      },
      {
        name: "analyze_schema",
        description: "Analyze database schema to understand structure and suggest CLI tools",
        inputSchema: {
          type: "object", 
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to analyze"
            },
            tables: {
              type: "array",
              items: { type: "string" },
              description: "Specific tables to analyze (optional)"
            },
            includeSystemTables: {
              type: "boolean",
              description: "Include system/metadata tables",
              default: false
            },
            analysisDepth: {
              type: "string",
              enum: ["basic", "detailed", "comprehensive"], 
              description: "How deep to analyze",
              default: "detailed"
            }
          },
          required: ["database"]
        }
      },
      {
        name: "generate_cli_tool",
        description: "Generate custom CLI tools based on database schema analysis",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string", 
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to generate CLI for"
            },
            projectName: {
              type: "string",
              description: "Name for the generated CLI project"
            },
            outputPath: {
              type: "string", 
              description: "Where to save generated CLI files"
            },
            includeOperations: {
              type: "array",
              items: {
                type: "string",
                enum: ["crud", "admin", "export", "import", "backup"]
              },
              description: "Which operations to include in CLI",
              default: ["crud"]
            },
            cliStyle: {
              type: "string",
              enum: ["basic", "interactive", "advanced"],
              description: "Style of CLI to generate", 
              default: "interactive"
            }
          },
          required: ["database", "projectName", "outputPath"]
        }
      },
      {
        name: "commit_generated_files",
        description: "Automatically commit generated CLI files to git with proper messages",
        inputSchema: {
          type: "object",
          properties: {
            repositoryPath: {
              type: "string",
              description: "Path to git repository"
            },
            commitMessage: {
              type: "string", 
              description: "Custom commit message (optional)"
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "Specific files to commit (optional, commits all changes if empty)"
            },
            createBranch: {
              type: "boolean",
              description: "Create a new branch for the commit",
              default: false
            },
            branchName: {
              type: "string",
              description: "Name for new branch (if createBranch is true)"
            }
          },
          required: ["repositoryPath"]
        }
      }
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
        
        // NEW AI-POWERED TOOL HANDLERS
        case "ai_validate_operation": {
          // EXPLANATION: This tool lets Claude request AI validation of database operations
          const validatedArgs = validateInput(AIValidationRequestSchema, args);
          const { database, operationType, query, collection, operation, requiresApproval } = validatedArgs;
          
          // Log the validation request
          logSecurityEvent("ai_validation_request", {
            database,
            operationType,
            hasQuery: !!query,
            hasCollection: !!collection,
            requiresApproval
          });
          
          // Check if AI service is available
          const aiAvailable = await aiService.isAvailable();
          if (!aiAvailable) {
            return {
              content: [{
                type: "text", 
                text: "❌ AI validation service (Ollama) is not available. Please ensure Ollama is running with llama3.1 model."
              }],
              isError: true
            };
          }
          
          let validationResult;
          
          if (database === 'mongo') {
            // Validate MongoDB operation
            validationResult = await aiService.validateMongoOperation(
              collection!, 
              operation, 
              operationType
            );
          } else {
            // Validate SQL query
            validationResult = await aiService.validateSQLQuery(query!, database);
          }
          
          // Format response with colors and clear status
          const status = validationResult.approved ? "✅ APPROVED" : "❌ REJECTED";
          const riskBadge = validationResult.riskLevel === 'low' ? "🟢 LOW RISK" 
                          : validationResult.riskLevel === 'medium' ? "🟡 MEDIUM RISK" 
                          : "🔴 HIGH RISK";
          
          const responseText = `
${status} - AI Validation Result

🎯 **Operation**: ${operationType} on ${database}
${riskBadge}

📝 **Reason**: ${validationResult.reason}

${validationResult.suggestions.length > 0 ? `
💡 **Suggestions**:
${validationResult.suggestions.map(s => `• ${s}`).join('\n')}
` : ''}

${validationResult.safetyScore ? `🏆 **Safety Score**: ${validationResult.safetyScore}/10` : ''}
          `;
          
          return {
            content: [{ type: "text", text: responseText.trim() }],
            isError: !validationResult.approved
          };
        }
        
        case "analyze_schema": {
          // EXPLANATION: This tool analyzes database schema to understand structure
          const validatedArgs = validateInput(SchemaAnalysisRequestSchema, args);
          const { database, tables, includeSystemTables, analysisDepth } = validatedArgs;
          
          logSecurityEvent("schema_analysis_request", {
            database,
            specificTables: tables?.length || 0,
            includeSystemTables,
            analysisDepth
          });
          
          try {
            let schemaInfo: any = {};
            
            // EXPLANATION: Get schema information from each database type
            if (database === 'postgres') {
              // Get PostgreSQL table information
              const tablesQuery = `
                SELECT table_name, column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_schema = 'public'
                ${tables ? `AND table_name = ANY($1)` : ''}
                ORDER BY table_name, ordinal_position
              `;
              const result = await pgDb.query(tablesQuery, tables ? [tables] : undefined);
              schemaInfo = { tables: result.rows };
              
            } else if (database === 'mysql') {
              // Get MySQL table information  
              const tablesQuery = `
                SELECT table_name, column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                ${tables ? `AND table_name IN (${tables.map(() => '?').join(',')})` : ''}
                ORDER BY table_name, ordinal_position
              `;
              const result = await mysqlDb.query(tablesQuery, tables);
              schemaInfo = { tables: result.rows };
              
            } else if (database === 'mongo') {
              // Get MongoDB collection information
              await mongoDb.connect();
              const collections = await mongoDb.listCollections();
              const filteredCollections = tables ? collections.filter(c => tables.includes(c)) : collections;
              schemaInfo = { collections: filteredCollections };
            }
            
            // Use AI to analyze schema and suggest CLI commands
            const aiAvailable = await aiService.isAvailable();
            if (!aiAvailable) {
              return {
                content: [{
                  type: "text",
                  text: `📊 **Schema Analysis** (${database})\n\n⚠️ AI analysis unavailable - Ollama not running\n\n${JSON.stringify(schemaInfo, null, 2)}`
                }]
              };
            }
            
            const analysis = await aiService.analyzeSchema(database, schemaInfo);
            
            const responseText = `
📊 **Schema Analysis Complete** (${database.toUpperCase()})

🗃️ **Database Structure**:
${analysis.tables.map(table => 
  `• **${table.name}** ${table.primaryKey ? `(PK: ${table.primaryKey})` : ''}`
).join('\n')}

🛠️ **Suggested CLI Commands** (${analysis.suggestedCommands.length}):
${analysis.suggestedCommands.slice(0, 10).map(cmd => 
  `• **${cmd.name}**: ${cmd.description}\n  Usage: \`${cmd.usage}\``
).join('\n\n')}

🏗️ **Recommended CLI Structure**: ${analysis.cliStructure}

💡 Use \`generate_cli_tool\` to create these commands automatically!
            `;
            
            return {
              content: [{ type: "text", text: responseText.trim() }]
            };
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Schema analysis failed";
            return {
              content: [{ type: "text", text: `❌ Schema analysis failed: ${errorMessage}` }],
              isError: true
            };
          }
        }
        
        case "generate_cli_tool": {
          // EXPLANATION: This tool generates CLI tools based on schema analysis
          const validatedArgs = validateInput(CLIGenerationRequestSchema, args);
          const { database, projectName, outputPath, includeOperations, cliStyle } = validatedArgs;
          
          logSecurityEvent("cli_generation_request", {
            database,
            projectName,
            outputPath,
            includeOperations,
            cliStyle
          });
          
          return {
            content: [{
              type: "text", 
              text: `🚧 **CLI Generation** - Coming in next step!\n\nWould generate CLI for:\n• Database: ${database}\n• Project: ${projectName}\n• Output: ${outputPath}\n• Operations: ${includeOperations?.join(', ') || 'crud'}\n• Style: ${cliStyle}`
            }]
          };
        }
        
        case "commit_generated_files": {
          // EXPLANATION: This tool commits generated files to git
          const validatedArgs = validateInput(GitOperationRequestSchema, {
            operation: 'commit',
            ...args
          });
          
          return {
            content: [{
              type: "text",
              text: `🚧 **Git Integration** - Coming in next step!\n\nWould commit files to: ${validatedArgs.repositoryPath}`
            }]
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
