#!/usr/bin/env node

/**
 * DevOmni MCP Server - Claude Desktop Edition
 * 
 * FULL ACCESS SERVER for Claude Desktop:
 * - Database schema access
 * - Intent analysis 
 * - Preview generation
 * - Context management
 * 
 * Role: Strategic Planning & Analysis Agent
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';

// Import all adapters and shared storage
import { PostgresAdapter } from './postgresAdapter.js';
import { MySQLAdapter } from './mysqlAdapter.js';
import { MongoAdapter } from './mongoAdapter.js';
import { SharedContextStorage } from './sharedContextStorage.js';
import { validateInput } from './inputValidator.js';

// Validation schemas
const UnifiedQuerySchema = z.object({
  database: z.enum(['postgres', 'mysql', 'mongo']),
  query: z.string().optional(),
  collection: z.string().optional(),
  filter: z.object({}).passthrough().optional(),
  projection: z.object({}).passthrough().optional(),
}).refine(data => {
  if (data.database === 'mongo') {
    return data.collection !== undefined;
  }
  return data.query !== undefined;
}, {
  message: "MongoDB queries require 'collection', SQL databases require 'query'"
});

// Security logging - use stderr to avoid interfering with MCP protocol
function logSecurityEvent(event: string, details: any) {
  const timestamp = new Date().toISOString();
  console.error(`[SECURITY] ${timestamp} - ${event}:`, JSON.stringify(details));
}

// Connection Manager for database connections
class ConnectionManager {
  private connections = new Map<string, any>();

  constructor() {
    this.initializeFromEnvironment();
  }

  private initializeFromEnvironment() {
    const envVars = process.env;
    let connectionCount = 0;

    // PostgreSQL connections
    Object.entries(envVars).forEach(([key, value]) => {
      if (key.startsWith('PG_') && key.endsWith('_CONNECTION_STRING') && value) {
        const profileName = key === 'PG_CONNECTION_STRING' ? 'default' : 
          key.replace('PG_', '').replace('_CONNECTION_STRING', '').toLowerCase();
        
        const adapter = new PostgresAdapter(value);
        this.connections.set(`postgres_${profileName}`, adapter);
        connectionCount++;
      }
    });

    // MySQL connections  
    Object.entries(envVars).forEach(([key, value]) => {
      if (key.startsWith('MYSQL_') && key.endsWith('_CONNECTION_STRING') && value) {
        const profileName = key === 'MYSQL_CONNECTION_STRING' ? 'default' :
          key.replace('MYSQL_', '').replace('_CONNECTION_STRING', '').toLowerCase();
        
        // Parse MySQL connection string or create config object
        const config = value.includes('mysql://') ? { uri: value } : JSON.parse(value);
        const adapter = new MySQLAdapter(config);
        this.connections.set(`mysql_${profileName}`, adapter);
        connectionCount++;
      }
    });

    // MongoDB connections
    Object.entries(envVars).forEach(([key, value]) => {
      if (key.startsWith('MONGODB_') && key.endsWith('_URI') && value) {
        const profileName = key === 'MONGODB_URI' ? 'default' :
          key.replace('MONGODB_', '').replace('_URI', '').toLowerCase();
        
        const dbName = envVars[key.replace('URI', 'DATABASE')] || 
          envVars.MONGODB_DATABASE || 'defaultdb';
          
        const adapter = new MongoAdapter(value, dbName);
        this.connections.set(`mongo_${profileName}`, adapter);
        connectionCount++;
      }
    });

    console.error(`Initialized ${connectionCount} database connections`);
  }

  /**
   * Get database adapter for specific database and profile
   */
  getConnection(database: string, profile: string = 'default'): any {
    const key = `${database}_${profile}`;
    const connection = this.connections.get(key);
    
    if (!connection) {
      throw new Error(`No connection found for ${database} profile '${profile}'. Available profiles: ${this.getAvailableProfiles(database).join(', ')}`);
    }
    
    return connection;
  }

  /**
   * List available profiles for a database type
   */
  getAvailableProfiles(database: string): string[] {
    const profiles = [];
    for (const key of this.connections.keys()) {
      if (key.startsWith(`${database}_`)) {
        profiles.push(key.replace(`${database}_`, ''));
      }
    }
    return profiles;
  }

  /**
   * Get all connection profiles for the extension
   */
  getAllProfiles(): Array<{ name: string; config: any; displayName: string }> {
    const profiles = new Map<string, any>();
    
    ['postgres', 'mysql', 'mongo'].forEach(database => {
      this.getAvailableProfiles(database).forEach(profile => {
        const key = `${database}_${profile}`;
        profiles.set(key, {
          name: profile,
          database,
          displayName: `${database.toUpperCase()} (${profile})`,
        });
      });
    });

    return Array.from(profiles.entries()).map(([name, config]) => ({ name, config, displayName: config.displayName }));
  }
}

// Initialize connection manager
const connectionManager = new ConnectionManager();

// Backward compatibility - keep existing connections for default profile (only if they exist)
let pgDb: any = null, mysqlDb: any = null, mongoDb: any = null;
try {
  pgDb = connectionManager.getConnection('postgres', 'default');
} catch (e) {
  console.error('No PostgreSQL default profile found');
}

try {
  mysqlDb = connectionManager.getConnection('mysql', 'default');
} catch (e) {
  console.error('No MySQL default profile found');
}

try {
  mongoDb = connectionManager.getConnection('mongo', 'default');
} catch (e) {
  console.error('No MongoDB default profile found');
}

// Use shared context storage for cross-agent communication
const sharedStorage = new SharedContextStorage();

/**
 * Analyzes user's natural language intent for API generation
 */
function analyzeUserIntent(userRequest: string, database: string, framework: string) {
  const analysis = {
    originalRequest: userRequest,
    database,
    framework,
    detectedTables: [] as string[],
    suggestedEndpoints: [] as string[],
    features: [] as string[],
    complexity: 'medium' as 'simple' | 'medium' | 'complex'
  };

  // Simple intent analysis (in production, this could use more sophisticated NLP)
  const request = userRequest.toLowerCase();

  // Detect common patterns
  if (request.includes('user') && request.includes('management')) {
    analysis.detectedTables = ['users', 'user_roles', 'permissions'];
    analysis.suggestedEndpoints = ['auth', 'profile', 'admin'];
    analysis.features = ['authentication', 'authorization', 'profile-management'];
  } else if (request.includes('crud') || request.includes('api')) {
    analysis.detectedTables = extractTableNamesFromRequest(request);
    analysis.suggestedEndpoints = ['create', 'read', 'update', 'delete'];
    analysis.features = ['crud-operations', 'validation'];
  } else if (request.includes('ecommerce') || request.includes('shop')) {
    analysis.detectedTables = ['products', 'orders', 'customers', 'categories'];
    analysis.suggestedEndpoints = ['catalog', 'cart', 'checkout', 'orders'];
    analysis.features = ['product-catalog', 'shopping-cart', 'payment-integration'];
  }

  // Determine complexity
  if (analysis.detectedTables.length > 5 || request.includes('complex') || request.includes('advanced')) {
    analysis.complexity = 'complex';
  } else if (analysis.detectedTables.length <= 2 && request.includes('simple')) {
    analysis.complexity = 'simple';
  }

  return analysis;
}

function extractTableNamesFromRequest(request: string): string[] {
  // Simple extraction - in production, this would be more sophisticated
  const commonTableWords = ['user', 'product', 'order', 'customer', 'category', 'post', 'comment', 'tag'];
  const found = [];
  
  for (const word of commonTableWords) {
    if (request.includes(word)) {
      found.push(word + 's'); // Pluralize
    }
  }
  
  return found.length > 0 ? found : ['items'];
}

/**
 * Generates a structured preview of what will be generated
 */
function generateCodePreview(intentAnalysis: any, database: string, framework: string = 'generic') {
  const preview = {
    intent: intentAnalysis,
    framework,
    database,
    fileStructure: [] as string[],
    codeSnippets: {} as Record<string, string>,
    suggestions: {
      endpoints: [] as string[],
      models: [] as string[],
      middleware: [] as string[]
    }
  };

  // Generate file structure based on framework
  if (framework === 'nextjs') {
    preview.fileStructure = [
      'pages/api/auth/[...nextauth].ts',
      'pages/api/users/index.ts',
      'pages/api/users/[id].ts',
      'lib/db.ts',
      'types/user.ts',
      'middleware/auth.ts'
    ];
  } else if (framework === 'express') {
    preview.fileStructure = [
      'routes/users.js',
      'routes/auth.js',
      'models/User.js',
      'middleware/auth.js',
      'config/database.js'
    ];
  } else {
    preview.fileStructure = [
      'api/users.ts',
      'models/user.ts',
      'auth/middleware.ts',
      'database/connection.ts'
    ];
  }

  // Generate endpoint suggestions
  for (const table of intentAnalysis.detectedTables) {
    preview.suggestions.endpoints.push(`GET /api/${table}`);
    preview.suggestions.endpoints.push(`POST /api/${table}`);
    preview.suggestions.endpoints.push(`PUT /api/${table}/:id`);
    preview.suggestions.endpoints.push(`DELETE /api/${table}/:id`);
  }

  return preview;
}

// Create the MCP server
const server = new Server(
  {
    name: "devomni-claude",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List tools handler - CLAUDE DESKTOP GETS FULL ACCESS
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // SCHEMA ACCESS TOOLS (Claude only)
      {
        name: "get_database_schema",
        description:
          "Extract complete database schema for AI code generation. Returns table/collection structures, column types, and relationships.",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to extract schema from",
            },
            table_name: {
              type: "string",
              description: "Specific table/collection name (optional, if not provided returns all tables)",
            },
            include_sample_data: {
              type: "boolean",
              description: "Include sample data for better API generation context (default: false)",
              default: false
            }
          },
          required: ["database"],
        },
      },
      {
        name: "export_schema_for_codegen",
        description:
          "Export database schema in a format optimized for AI code generation. Returns structured schema with TypeScript types, validation rules, and API suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to export schema from",
            },
            target_framework: {
              type: "string",
              enum: ["express", "nextjs", "fastapi", "nestjs", "generic"],
              description: "Target framework for optimized schema format (default: generic)",
              default: "generic"
            },
            include_relationships: {
              type: "boolean",
              description: "Include foreign key relationships and suggestions (default: true)",
              default: true
            }
          },
          required: ["database"],
        },
      },
      
      // ANALYSIS TOOLS (Claude only)
      {
        name: "analyze_intent",
        description:
          "Analyze natural language intent for API generation. Parses user requests like 'generate user management APIs' and returns structured analysis of what should be generated.",
        inputSchema: {
          type: "object",
          properties: {
            user_request: {
              type: "string",
              description: "Natural language description of what the user wants to generate (e.g., 'create user management APIs with authentication')"
            },
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Target database type"
            },
            framework: {
              type: "string",
              enum: ["nextjs", "express", "nestjs", "fastapi", "generic"],
              description: "Target framework for code generation"
            }
          },
          required: ["user_request", "database"],
          additionalProperties: false
        },
      },
      {
        name: "generate_preview",
        description:
          "Generate a preview of API code that will be created based on analyzed intent. Shows file structure, code snippets, and asks for confirmation before creating actual files.",
        inputSchema: {
          type: "object",
          properties: {
            intent_analysis: {
              type: "object",
              description: "Output from analyze_intent tool"
            },
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Target database type"
            },
            framework: {
              type: "string",
              enum: ["nextjs", "express", "nestjs", "fastapi", "generic"],
              description: "Target framework for code generation",
              default: "generic"
            },
            include_tests: {
              type: "boolean",
              description: "Include test files in preview",
              default: false
            }
          },
          required: ["intent_analysis", "database"],
          additionalProperties: false
        },
      },
      
      // CONTEXT MANAGEMENT TOOLS (Both agents)
      {
        name: "create_workflow_context",
        description:
          "Create a shareable context between AI agents (Claude Desktop ↔ GitHub Copilot). Stores analysis and preview for cross-agent collaboration.",
        inputSchema: {
          type: "object",
          properties: {
            context_name: {
              type: "string",
              description: "Unique name for this workflow context"
            },
            intent_analysis: {
              type: "object",
              description: "Analyzed intent from analyze_intent tool"
            },
            preview_data: {
              type: "object",
              description: "Preview data from generate_preview tool"
            },
            expires_in_minutes: {
              type: "number",
              description: "Context expiration time in minutes",
              default: 60
            }
          },
          required: ["context_name", "intent_analysis"],
          additionalProperties: false
        },
      },
      {
        name: "list_contexts",
        description:
          "List all available workflow contexts for interactive selection. Shows context names, creation times, and expiration status.",
        inputSchema: {
          type: "object",
          properties: {
            include_expired: {
              type: "boolean",
              description: "Include expired contexts in the list",
              default: false
            }
          },
          additionalProperties: false
        },
      },
      {
        name: "search_contexts",
        description:
          "Search workflow contexts by keywords, database type, or framework. Useful for finding relevant contexts when multiple exist.",
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords to search for in context names and intent analysis"
            },
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Filter by database type"
            },
            framework: {
              type: "string",
              enum: ["nextjs", "express", "nestjs", "fastapi", "generic"],
              description: "Filter by target framework"
            }
          },
          additionalProperties: false
        },
      },
      {
        name: "get_context",
        description:
          "Retrieve a specific workflow context by name. Used by GitHub Copilot and other AI tools to access context created by Claude Desktop.",
        inputSchema: {
          type: "object",
          properties: {
            context_name: {
              type: "string",
              description: "Name of the workflow context to retrieve"
            }
          },
          required: ["context_name"],
          additionalProperties: false
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case "get_database_schema": {
          const { database, table_name, include_sample_data = false } = args as any;
          
          let schema;
          switch (database) {
            case 'postgres':
              if (!pgDb) throw new Error('No PostgreSQL connection available');
              schema = await getPostgresSchema(table_name, include_sample_data);
              break;
            case 'mysql':
              if (!mysqlDb) throw new Error('No MySQL connection available');
              schema = await getMySQLSchema(table_name, include_sample_data);
              break;
            case 'mongo':
              if (!mongoDb) throw new Error('No MongoDB connection available');
              schema = await getMongoSchema(table_name, include_sample_data);
              break;
            default:
              throw new Error(`Unsupported database: ${database}`);
          }
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(schema, null, 2)
            }],
          };
        }

        case "export_schema_for_codegen": {
          const { database, target_framework = 'generic', include_relationships = true } = args as any;
          
          let schema;
          switch (database) {
            case 'postgres':
              if (!pgDb) throw new Error('No PostgreSQL connection available');
              schema = await getPostgresSchema();
              break;
            case 'mysql':
              if (!mysqlDb) throw new Error('No MySQL connection available');
              schema = await getMySQLSchema();
              break;
            case 'mongo':
              if (!mongoDb) throw new Error('No MongoDB connection available');
              schema = await getMongoSchema();
              break;
            default:
              throw new Error(`Unsupported database: ${database}`);
          }

          const result = formatSchemaForCodegen(schema, target_framework, include_relationships);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }],
          };
        }

        case "analyze_intent": {
          const { user_request, database, framework } = args as any;
          const analysis = analyzeUserIntent(user_request, database, framework);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(analysis, null, 2)
            }],
          };
        }

        case "generate_preview": {
          const { intent_analysis, database, framework = 'generic', include_tests = false } = args as any;
          const preview = generateCodePreview(intent_analysis, database, framework);
          
          return {
            content: [{
              type: "text", 
              text: JSON.stringify(preview, null, 2)
            }],
          };
        }

        case "create_workflow_context": {
          const { context_name, intent_analysis, preview_data, expires_in_minutes = 60 } = args as any;
          const result = await sharedStorage.createContext(context_name, intent_analysis, preview_data, expires_in_minutes);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }],
          };
        }

        case "list_contexts": {
          const { include_expired = false } = args as any;
          const contexts = await sharedStorage.listContexts(include_expired);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ contexts }, null, 2)
            }],
          };
        }

        case "search_contexts": {
          const { keywords, database, framework } = args as any;
          const contexts = await sharedStorage.searchContexts(keywords, database, framework);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ contexts }, null, 2)
            }],
          };
        }

        case "get_context": {
          const { context_name } = args as any;
          const context = await sharedStorage.getContext(context_name);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(context, null, 2)
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            tool: name,
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true,
      };
    }
  }
);

// Helper functions (schema extraction)
async function getPostgresSchema(tableName?: string, includeSampleData = false) {
  if (!pgDb) {
    throw new Error('No PostgreSQL connection available.');
  }
  
  const query = tableName
    ? 'SELECT * FROM information_schema.columns WHERE table_name = $1'
    : 'SELECT * FROM information_schema.columns ORDER BY table_name, ordinal_position';
  
  const params = tableName ? [tableName] : [];
  const result = await pgDb.query(query, params);
  
  const schema: any = {};
  for (const row of result.rows) {
    if (!schema[row.table_name]) {
      schema[row.table_name] = { columns: [] };
    }
    schema[row.table_name].columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES'
    });
  }

  if (includeSampleData) {
    for (const tableName of Object.keys(schema)) {
      try {
        const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
        const sampleResult = await pgDb.query(sampleQuery);
        schema[tableName] = { ...schema[tableName], sampleData: sampleResult.rows };
      } catch (e) {
        schema[tableName] = { ...schema[tableName], sampleData: [] };
      }
    }
  }

  return schema;
}

async function getMySQLSchema(tableName?: string, includeSampleData = false) {
  if (!mysqlDb) {
    throw new Error('No MySQL connection available.');
  }
  
  const query = tableName
    ? 'SELECT * FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position'
    : 'SELECT * FROM information_schema.columns ORDER BY table_name, ordinal_position';
  
  const params = tableName ? [tableName] : [];
  const result = await mysqlDb.query(query, params);
  
  const schema: any = {};
  const rows = Array.isArray(result) ? result : [result];
  
  for (const row of rows) {
    if (!schema[row.table_name || row.TABLE_NAME]) {
      const table = row.table_name || row.TABLE_NAME;
      schema[table] = { columns: [] };
    }
    const table = row.table_name || row.TABLE_NAME;
    schema[table].columns.push({
      name: row.column_name || row.COLUMN_NAME,
      type: row.data_type || row.DATA_TYPE,
      nullable: (row.is_nullable || row.IS_NULLABLE) === 'YES'
    });
  }

  if (includeSampleData) {
    for (const tableName of Object.keys(schema)) {
      try {
        const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
        const sampleResult = await mysqlDb.query(sampleQuery);
        schema[tableName] = { ...schema[tableName], sampleData: (sampleResult as any).rows || sampleResult };
      } catch (e) {
        schema[tableName] = { ...schema[tableName], sampleData: [] };
      }
    }
  }

  return schema;
}

async function getMongoSchema(collectionName?: string, includeSampleData = false) {
  if (!mongoDb) {
    throw new Error('No MongoDB connection available.');
  }
  
  const collections = collectionName ? [collectionName] : await mongoDb.listCollections();
  const schema: any = {};

  for (const collection of collections) {
    schema[collection] = { 
      type: 'collection',
      sampleDocument: {}
    };

    if (includeSampleData) {
      try {
        const sampleDocs = await mongoDb.find(collection, {});
        schema[collection].sampleData = sampleDocs.slice(0, 3);
        
        if (sampleDocs.length > 0) {
          schema[collection].sampleDocument = sampleDocs[0];
        }
      } catch (e) {
        schema[collection].sampleData = [];
      }
    }
  }

  return schema;
}

function formatSchemaForCodegen(schema: any, targetFramework: string, includeRelationships: boolean) {
  const result = {
    schema,
    targetFramework,
    suggestions: {
      endpoints: [] as string[],
      models: Object.keys(schema),
      types: {} as Record<string, any>
    }
  };

  // Generate endpoint suggestions for each table
  for (const tableName of Object.keys(schema)) {
    result.suggestions.endpoints.push(`GET /api/${tableName}`);
    result.suggestions.endpoints.push(`POST /api/${tableName}`);
    result.suggestions.endpoints.push(`PUT /api/${tableName}/:id`);
    result.suggestions.endpoints.push(`DELETE /api/${tableName}/:id`);
  }

  return result;
}

// Run the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude Desktop MCP server running on stdio");
}

runServer().catch((error) => {
  console.error("Failed to run server:", error);
  process.exit(1);
});