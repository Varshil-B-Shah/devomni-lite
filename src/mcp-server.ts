import dotenv from 'dotenv';

// Completely suppress all output during dotenv loading
const originalWrite = process.stdout.write;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

process.stdout.write = () => true;
console.log = () => {};
console.error = () => {};
console.warn = () => {};

dotenv.config();

// Restore output functions
process.stdout.write = originalWrite;
console.log = originalLog;
console.error = originalError;
console.warn = originalWarn;

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
import { SharedContextStorage } from "./sharedContextStorage.js";
import { 
  UnifiedQuerySchema, 
  CompareDatabasesSchema,
  GetDatabaseSchemaSchema,
  ListDatabaseTablesSchema,
  ExportSchemaForCodegenSchema,
  AnalyzeIntentSchema,
  GeneratePreviewSchema,
  CreateWorkflowContextSchema,
  ListContextsSchema,
  SearchContextsSchema,
  GetContextSchema,
  validateInput,
  logSecurityEvent 
} from "./inputValidator.js";

/**
 * Connection Profile Manager
 * 
 * WHY CONNECTION PROFILES:
 * - Enables multi-project support with different databases
 * - Single MCP server can serve multiple projects
 * - Clean separation of connection configurations
 * - Easy switching between dev/staging/production environments
 * 
 * ALTERNATIVE: Single hardcoded connections
 * ❌ Problem: Only works with one database per type
 * ❌ Problem: Can't support multiple projects
 * ❌ Problem: Manual server restart needed for different databases
 */
class ConnectionManager {
  private connections: Map<string, any> = new Map();

  constructor() {
    this.initializeConnections();
  }

  /**
   * Initialize all available connections from environment variables
   * 
   * WHY ENVIRONMENT VARIABLE PARSING:
   * - Follows 12-factor app methodology
   * - Easy to configure different environments
   * - Secure (no hardcoded credentials in code)
   * - Standard practice for connection management
   * 
   * ALTERNATIVE: Configuration files
   * ❌ Problem: Risk of committing credentials to version control
   * ❌ Problem: More complex deployment configuration
   */
  private initializeConnections() {
    // Parse PostgreSQL connections
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('PG_CONNECTION_STRING')) {
        const profileName = key === 'PG_CONNECTION_STRING' ? 'default' : 
          key.replace('PG_CONNECTION_STRING_', '').toLowerCase();
        
        this.connections.set(`postgres_${profileName}`, 
          new PostgresAdapter(process.env[key]!)
        );
      }
    });

    // Parse MySQL connections
    const mysqlProfiles = this.extractMySQLProfiles();
    mysqlProfiles.forEach(profile => {
      this.connections.set(`mysql_${profile.name}`, 
        new MySQLAdapter(profile.config)
      );
    });

    // Parse MongoDB connections  
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MONGODB_URI')) {
        const profileName = key === 'MONGODB_URI' ? 'default' :
          key.replace('MONGODB_URI_', '').toLowerCase();
        
        const dbName = process.env[key.replace('URI', 'DATABASE')] || 
          process.env.MONGODB_DATABASE || 'defaultdb';
        
        this.connections.set(`mongo_${profileName}`,
          new MongoAdapter(process.env[key]!, dbName)
        );
      }
    });

    console.error(`Initialized ${this.connections.size} database connections`);
  }

  /**
   * Extract MySQL profiles from environment variables
   * 
   * WHY GROUPED MYSQL CONFIG:
   * - MySQL requires multiple environment variables per connection
   * - Need to group related variables by profile name
   * - Supports both simple and complex MySQL configurations
   */
  private extractMySQLProfiles() {
    const profiles = new Map<string, any>();
    
    // Default MySQL connection
    if (process.env.MYSQL_HOST) {
      profiles.set('default', {
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
      });
    }

    // Named MySQL profiles
    Object.keys(process.env).forEach(key => {
      const match = key.match(/^MYSQL_HOST_(.+)$/);
      if (match && match[1]) {
        const profileName = match[1].toLowerCase();
        const profile = {
          host: process.env[key],
          port: Number(process.env[`MYSQL_PORT_${match[1]}`]) || 3306,
          user: process.env[`MYSQL_USER_${match[1]}`],
          password: process.env[`MYSQL_PASSWORD_${match[1]}`],
          database: process.env[`MYSQL_DATABASE_${match[1]}`]
        };
        
        profiles.set(profileName, profile);
      }
    });

    return Array.from(profiles.entries()).map(([name, config]) => ({ name, config }));
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
    const profiles: string[] = [];
    
    this.connections.forEach((_, key) => {
      if (key.startsWith(`${database}_`)) {
        profiles.push(key.replace(`${database}_`, ''));
      }
    });
    
    return profiles;
  }

  /**
   * Get all available connection profiles
   */
  getAllProfiles() {
    const profiles: Array<{
      name: string;
      database: 'postgres' | 'mysql' | 'mongo';
      displayName: string;
      description?: string;
    }> = [];

    this.connections.forEach((_, key) => {
      const parts = key.split('_');
      const database = parts[0];
      const profile = parts.slice(1).join('_'); // Handle profiles with underscores
      
      if (database && profile) {
        profiles.push({
          name: profile,
          database: database as 'postgres' | 'mysql' | 'mongo',
          displayName: `${database.toUpperCase()} (${profile})`,
          description: `${database} connection profile: ${profile}`
        });
      }
    });

    return profiles;
  }
}

// Initialize connection manager
const connectionManager = new ConnectionManager();

// Backward compatibility - keep existing connections for default profile (only if they exist)
let pgDb: any = null, mysqlDb: any = null, mongoDb: any = null;
try {
  pgDb = connectionManager.getConnection('postgres', 'default');
} catch (e) {
  console.warn('No PostgreSQL default profile found');
}

try {
  mysqlDb = connectionManager.getConnection('mysql', 'default');
} catch (e) {
  console.warn('No MySQL default profile found');
}

try {
  mongoDb = connectionManager.getConnection('mongo', 'default');
} catch (e) {
  console.warn('No MongoDB default profile found');
}

//==========================================
// PREVIEW-BASED WORKFLOW HELPER FUNCTIONS  
// ==========================================

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
    analysis.features = ['product-catalog', 'order-management', 'cart'];
    analysis.complexity = 'complex';
  }

  // Detect authentication requirements
  if (request.includes('auth') || request.includes('login') || request.includes('jwt')) {
    analysis.features.push('authentication', 'jwt-tokens');
  }

  // Detect additional features
  if (request.includes('test') || request.includes('testing')) {
    analysis.features.push('unit-tests');
  }

  if (request.includes('validation') || request.includes('validate')) {
    analysis.features.push('input-validation');
  }

  return analysis;
}

/**
 * Extracts potential table names from user request
 */
function extractTableNamesFromRequest(request: string): string[] {
  const commonTableNames = ['users', 'products', 'orders', 'customers', 'categories', 'posts', 'comments', 'tags'];
  return commonTableNames.filter(table => 
    request.includes(table) || request.includes(table.slice(0, -1)) // singular form
  );
}

/**
 * Generates a preview of what will be created
 */
async function generateCodePreview(intentAnalysis: any, database: string, framework: string, includeTests: boolean) {
  const preview = {
    analysis: intentAnalysis,
    fileStructure: [] as any[],
    codeSnippets: {} as any,
    estimatedFiles: 0,
    nextSteps: [] as string[]
  };

  // Get actual database schema for detected tables
  let actualTables = [];
  try {
    for (const tableName of intentAnalysis.detectedTables) {
      try {
        let schema;
        if (database === 'postgres') {
          schema = await getPostgresSchema(tableName, false);
        } else if (database === 'mysql') {
          schema = await getMySQLSchema(tableName, false);
        } else if (database === 'mongo') {
          schema = await getMongoSchema(tableName, false);
        }
        if (schema && Object.keys(schema.tables).length > 0) {
          actualTables.push(tableName);
        }
      } catch (error) {
        // Table doesn't exist, skip it
        continue;
      }
    }
  } catch (error) {
    // Fallback to detected tables if schema retrieval fails
    actualTables = intentAnalysis.detectedTables;
  }

  // Generate file structure based on framework
  if (framework === 'nextjs') {
    actualTables.forEach((table: string) => {
      preview.fileStructure.push({
        path: `app/api/${table}/route.ts`,
        description: `CRUD operations for ${table}`,
        size: 'large'
      });
      preview.fileStructure.push({
        path: `app/api/${table}/[id]/route.ts`,
        description: `Individual ${table} operations`,
        size: 'medium'
      });
    });

    preview.fileStructure.push({
      path: 'types/database.ts',
      description: 'TypeScript type definitions',
      size: 'medium'
    });

    preview.fileStructure.push({
      path: 'lib/database.ts',
      description: 'Database connection utility',
      size: 'small'
    });

    if (includeTests) {
      actualTables.forEach((table: string) => {
        preview.fileStructure.push({
          path: `__tests__/api/${table}.test.ts`,
          description: `API tests for ${table}`,
          size: 'medium'
        });
      });
    }
  }

  preview.estimatedFiles = preview.fileStructure.length;

  // Generate sample code snippets
  if (actualTables.length > 0) {
    const sampleTable = actualTables[0];
    if (framework === 'nextjs') {
      preview.codeSnippets.apiRoute = `// app/api/${sampleTable}/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    // Implementation based on your ${database} schema
    const results = await db.query('SELECT * FROM ${sampleTable} LIMIT 10');
    return NextResponse.json(results.rows);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ${sampleTable}' },
      { status: 500 }
    );
  }
}`;

      preview.codeSnippets.types = `// types/database.ts
export interface ${capitalize(sampleTable)} {
  id: number;
  // Fields will be generated based on actual schema
  created_at: Date;
  updated_at: Date;
}`;
    }
  }

  // Next steps for user
  preview.nextSteps = [
    "Review the generated file structure",
    "Confirm the code snippets look correct",
    "Run the generation command to create files",
    "Test the generated APIs",
    "Customize as needed for your use case"
  ];

  return preview;
}

/**
 * Creates a workflow context for cross-agent communication
 */
function createWorkflowContext(contextName: string, intentAnalysis: any, previewData?: any, expiresInMinutes: number = 60) {
  return sharedStorage.createContext(contextName, intentAnalysis, previewData, expiresInMinutes);
}

/**
 * Helper function to capitalize strings
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * List all workflow contexts with optional filtering
 */
function listWorkflowContexts(includeExpired: boolean = false) {
  return sharedStorage.listContexts(includeExpired);
}

/**
 * Search workflow contexts by criteria
 */
function searchWorkflowContexts(keywords?: string[], database?: string, framework?: string) {
  return sharedStorage.searchContexts(keywords, database, framework);
}

/**
 * Get a specific workflow context by name
 */
function getWorkflowContext(contextName: string) {
  return sharedStorage.getContext(contextName);
}

// Schema extraction functions
async function getPostgresSchema(tableName?: string, includeSampleData = false) {
  try {
    let query;
    let params: any[] = [];
    
    if (tableName) {
      query = `
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          tc.constraint_type
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu 
          ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc 
          ON kcu.constraint_name = tc.constraint_name
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.table_name, c.ordinal_position
      `;
      params = [tableName];
    } else {
      query = `
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          tc.constraint_type
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu 
          ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc 
          ON kcu.constraint_name = tc.constraint_name
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position
      `;
    }

    if (!pgDb) {
      throw new Error('No PostgreSQL connection available. Please configure database connection first.');
    }
    const result = await pgDb.query(query, params);
    const schema = organizeSchemaData(result.rows, 'postgres');
    
    if (includeSampleData && tableName) {
      const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
      if (!pgDb) {
        throw new Error('No PostgreSQL connection available.');
      }
      const sampleResult = await pgDb.query(sampleQuery);
      schema[tableName] = { ...schema[tableName], sampleData: sampleResult.rows };
    }
    
    return schema;
  } catch (error) {
    throw new Error(`Failed to get PostgreSQL schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getMySQLSchema(tableName?: string, includeSampleData = false) {
  try {
    let query;
    let params: any[] = [];
    
    if (tableName) {
      query = `
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.column_key,
          kcu.referenced_table_name,
          kcu.referenced_column_name
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu 
          ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
        WHERE c.table_schema = DATABASE() AND c.table_name = ?
        ORDER BY c.table_name, c.ordinal_position
      `;
      params = [tableName];
    } else {
      query = `
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.column_key,
          kcu.referenced_table_name,
          kcu.referenced_column_name
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu 
          ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
        WHERE c.table_schema = DATABASE()
        ORDER BY c.table_name, c.ordinal_position
      `;
    }

    const result = await mysqlDb.query(query, params);
    const schema = organizeSchemaData((result as any).rows || result, 'mysql');
    
    if (includeSampleData && tableName) {
      const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
      const sampleResult = await mysqlDb.query(sampleQuery);
      schema[tableName] = { ...schema[tableName], sampleData: (sampleResult as any).rows || sampleResult };
    }
    
    return schema;
  } catch (error) {
    throw new Error(`Failed to get MySQL schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getMongoSchema(collectionName?: string, includeSampleData = false) {
  try {
    const collections = collectionName ? [collectionName] : await mongoDb.listCollections();
    const schema: any = {};
    
    for (const collection of collections) {
      // Get sample documents to infer schema
      const sampleDocs = await mongoDb.find(collection, {});
      const inferredSchema = inferMongoSchema(sampleDocs);
      
      schema[collection] = {
        type: 'collection',
        fields: inferredSchema,
        documentCount: sampleDocs.length
      };
      
      if (includeSampleData) {
        schema[collection].sampleData = sampleDocs.slice(0, 3);
      }
    }
    
    return schema;
  } catch (error) {
    throw new Error(`Failed to get MongoDB schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getPostgresTables(includeRowCounts = false) {
  try {
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const result = await pgDb.query(query);
    const tables = result.rows.map((row: any) => ({ 
      name: row.table_name, 
      type: 'table',
      rowCount: undefined as number | null | undefined
    }));
    
    if (includeRowCounts) {
      for (const table of tables) {
        try {
          const countResult = await pgDb.query(`SELECT COUNT(*) as count FROM ${table.name}`);
          table.rowCount = parseInt(countResult.rows[0].count);
        } catch {
          table.rowCount = null;
        }
      }
    }
    
    return { database: 'postgres', tables };
  } catch (error) {
    throw new Error(`Failed to get PostgreSQL tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getMySQLTables(includeRowCounts = false) {
  try {
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const result = await mysqlDb.query(query);
    const tables = ((result as any).rows || result).map((row: any) => ({ 
      name: row.table_name, 
      type: 'table',
      rowCount: undefined as number | null | undefined
    }));
    
    if (includeRowCounts) {
      for (const table of tables) {
        try {
          const countResult = await mysqlDb.query(`SELECT COUNT(*) as count FROM ${table.name}`);
          const rows = (countResult as any).rows || countResult;
          table.rowCount = parseInt(rows[0].count);
        } catch {
          table.rowCount = null;
        }
      }
    }
    
    return { database: 'mysql', tables };
  } catch (error) {
    throw new Error(`Failed to get MySQL tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getMongoTables(includeRowCounts = false) {
  try {
    const collections = await mongoDb.listCollections();
    const tables = collections.map((name: string) => ({ 
      name, 
      type: 'collection',
      rowCount: undefined as string | null | undefined
    }));
    
    if (includeRowCounts) {
      for (const table of tables) {
        try {
          const docs = await mongoDb.find(table.name, {});
          // For performance, we'll use a rough estimate rather than counting all documents
          table.rowCount = `~${docs.length}+`;
        } catch {
          table.rowCount = null;
        }
      }
    }
    
    return { database: 'mongo', tables };
  } catch (error) {
    throw new Error(`Failed to get MongoDB collections: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function exportPostgresForCodegen(targetFramework = 'generic', includeRelationships = true) {
  try {
    const schema = await getPostgresSchema();
    return formatSchemaForCodegen(schema, 'postgres', targetFramework, includeRelationships);
  } catch (error) {
    throw new Error(`Failed to export PostgreSQL schema for codegen: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function exportMySQLForCodegen(targetFramework = 'generic', includeRelationships = true) {
  try {
    const schema = await getMySQLSchema();
    return formatSchemaForCodegen(schema, 'mysql', targetFramework, includeRelationships);
  } catch (error) {
    throw new Error(`Failed to export MySQL schema for codegen: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function exportMongoForCodegen(targetFramework = 'generic', includeRelationships = true) {
  try {
    const schema = await getMongoSchema();
    return formatSchemaForCodegen(schema, 'mongo', targetFramework, includeRelationships);
  } catch (error) {
    throw new Error(`Failed to export MongoDB schema for codegen: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper functions
function organizeSchemaData(rows: any[], dbType: string) {
  const schema: any = {};
  
  for (const row of rows) {
    const tableName = row.table_name;
    if (!schema[tableName]) {
      schema[tableName] = {
        type: 'table',
        columns: {}
      };
    }
    
    schema[tableName].columns[row.column_name] = {
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
      key: dbType === 'mysql' ? row.column_key : row.constraint_type,
      references: row.referenced_table_name ? {
        table: row.referenced_table_name,
        column: row.referenced_column_name
      } : null
    };
  }
  
  return schema;
}

function inferMongoSchema(documents: any[]) {
  const schema: any = {};
  
  for (const doc of documents) {
    for (const [key, value] of Object.entries(doc)) {
      if (!schema[key]) {
        schema[key] = {
          types: new Set(),
          nullable: false,
          examples: []
        };
      }
      
      if (value === null || value === undefined) {
        schema[key].nullable = true;
      } else {
        schema[key].types.add(typeof value);
        if (schema[key].examples.length < 3) {
          schema[key].examples.push(value);
        }
      }
    }
  }
  
  // Convert sets to arrays for JSON serialization
  for (const field of Object.values(schema) as any) {
    field.types = Array.from(field.types);
  }
  
  return schema;
}

function formatSchemaForCodegen(schema: any, dbType: string, targetFramework: string, includeRelationships: boolean) {
  const result = {
    database: dbType,
    targetFramework,
    generatedAt: new Date().toISOString(),
    tables: schema,
    suggestions: {
      endpoints: [] as string[],
      types: [] as string[],
      validations: [] as string[]
    }
  };
  
  // Add framework-specific suggestions
  for (const [tableName, tableData] of Object.entries(schema) as any) {
    result.suggestions.endpoints.push(`GET /api/${tableName}`);
    result.suggestions.endpoints.push(`POST /api/${tableName}`);
    result.suggestions.endpoints.push(`PUT /api/${tableName}/:id`);
    result.suggestions.endpoints.push(`DELETE /api/${tableName}/:id`);
    
    if (targetFramework === 'nextjs') {
      result.suggestions.types.push(`interface ${capitalize(tableName)} { ... }`);
    } else if (targetFramework === 'express') {
      result.suggestions.types.push(`type ${capitalize(tableName)}Type = { ... }`);
    }
  }
  
  return result;
}

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
        name: "list_database_tables",
        description:
          "List all tables/collections in a database for schema exploration and API generation planning.",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Which database to list tables from",
            },
            include_row_counts: {
              type: "boolean",
              description: "Include row counts for each table (default: false)",
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
      {
        name: "list_connection_profiles",
        description:
          "List all available database connection profiles configured in the DevOmni MCP server. Used by VS Code extension to show available database connections for project setup.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        },
      },
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
        case "get_database_schema": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(GetDatabaseSchemaSchema, args);
          const { database, table_name, include_sample_data } = validatedArgs;
          
          // Log the schema request for security monitoring
          logSecurityEvent("get_database_schema_attempt", {
            database,
            table_name: table_name || "all_tables",
            include_sample_data: !!include_sample_data
          });

          let schemaResult;
          if (database === "postgres") {
            schemaResult = await getPostgresSchema(table_name, include_sample_data);
          } else if (database === "mysql") {
            schemaResult = await getMySQLSchema(table_name, include_sample_data);
          } else if (database === "mongo") {
            schemaResult = await getMongoSchema(table_name, include_sample_data);
          } else {
            throw new Error("Unknown database type");
          }

          return {
            content: [
              { type: "text", text: JSON.stringify(schemaResult, null, 2) },
            ],
          };
        }
        case "list_database_tables": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(ListDatabaseTablesSchema, args);
          const { database, include_row_counts } = validatedArgs;
          
          // Log the tables list request for security monitoring
          logSecurityEvent("list_database_tables_attempt", {
            database,
            include_row_counts: !!include_row_counts
          });

          let tablesResult;
          if (database === "postgres") {
            tablesResult = await getPostgresTables(include_row_counts);
          } else if (database === "mysql") {
            tablesResult = await getMySQLTables(include_row_counts);
          } else if (database === "mongo") {
            tablesResult = await getMongoTables(include_row_counts);
          } else {
            throw new Error("Unknown database type");
          }

          return {
            content: [
              { type: "text", text: JSON.stringify(tablesResult, null, 2) },
            ],
          };
        }
        case "export_schema_for_codegen": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(ExportSchemaForCodegenSchema, args);
          const { database, target_framework, include_relationships } = validatedArgs;
          
          // Log the codegen export request for security monitoring
          logSecurityEvent("export_schema_for_codegen_attempt", {
            database,
            target_framework: target_framework || "generic",
            include_relationships: !!include_relationships
          });

          let codegenSchema;
          if (database === "postgres") {
            codegenSchema = await exportPostgresForCodegen(target_framework, include_relationships);
          } else if (database === "mysql") {
            codegenSchema = await exportMySQLForCodegen(target_framework, include_relationships);
          } else if (database === "mongo") {
            codegenSchema = await exportMongoForCodegen(target_framework, include_relationships);
          } else {
            throw new Error("Unknown database type");
          }

          return {
            content: [
              { type: "text", text: JSON.stringify(codegenSchema, null, 2) },
            ],
          };
        }
        case "list_connection_profiles": {
          // No input validation needed - this tool takes no arguments
          
          // Log the profiles list request for security monitoring
          logSecurityEvent("list_connection_profiles_attempt", {
            timestamp: new Date().toISOString()
          });

          const profiles = connectionManager.getAllProfiles();

          return {
            content: [
              { type: "text", text: JSON.stringify(profiles, null, 2) },
            ],
          };
        }
        case "analyze_intent": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(AnalyzeIntentSchema, args);
          const { user_request, database, framework } = validatedArgs;
          
          // Log the intent analysis request
          logSecurityEvent("analyze_intent_attempt", {
            user_request: user_request.substring(0, 100), // Truncate for security
            database,
            framework
          });

          // Analyze the user's natural language request
          const analysis = analyzeUserIntent(user_request, database, framework || "generic");

          return {
            content: [
              { type: "text", text: JSON.stringify(analysis, null, 2) },
            ],
          };
        }
        case "generate_preview": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(GeneratePreviewSchema, args);
          const { intent_analysis, database, framework, include_tests } = validatedArgs;
          
          // Log the preview generation request
          logSecurityEvent("generate_preview_attempt", {
            database,
            framework,
            include_tests: !!include_tests,
            tables_count: (intent_analysis as any)?.tables?.length || 0
          });

          // Generate preview based on intent analysis
          const preview = await generateCodePreview(intent_analysis, database, framework || "generic", include_tests || false);

          return {
            content: [
              { type: "text", text: JSON.stringify(preview, null, 2) },
            ],
          };
        }
        case "create_workflow_context": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(CreateWorkflowContextSchema, args);
          const { context_name, intent_analysis, preview_data, expires_in_minutes } = validatedArgs;
          
          // Log context creation
          logSecurityEvent("create_workflow_context_attempt", {
            context_name,
            expires_in_minutes: expires_in_minutes || 60
          });

          // Store context for cross-agent communication
          const context = createWorkflowContext(context_name, intent_analysis, preview_data, expires_in_minutes || 60);

          return {
            content: [
              { type: "text", text: JSON.stringify(context, null, 2) },
            ],
          };
        }
        case "list_contexts": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(ListContextsSchema, args);
          const { include_expired } = validatedArgs;
          
          // Log context listing request
          logSecurityEvent("list_contexts_attempt", {
            include_expired: !!include_expired
          });

          const contexts = listWorkflowContexts(include_expired || false);

          return {
            content: [
              { type: "text", text: JSON.stringify(contexts, null, 2) },
            ],
          };
        }
        case "search_contexts": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(SearchContextsSchema, args);
          const { keywords, database, framework } = validatedArgs;
          
          // Log context search request
          logSecurityEvent("search_contexts_attempt", {
            keywords,
            database,
            framework
          });

          const contexts = searchWorkflowContexts(keywords, database, framework);

          return {
            content: [
              { type: "text", text: JSON.stringify(contexts, null, 2) },
            ],
          };
        }
        case "get_context": {
          // Security: Validate input using new schema
          const validatedArgs = validateInput(GetContextSchema, args);
          const { context_name } = validatedArgs;
          
          // Log context retrieval request
          logSecurityEvent("get_context_attempt", {
            context_name
          });

          const context = getWorkflowContext(context_name);

          return {
            content: [
              { type: "text", text: JSON.stringify(context, null, 2) },
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
  // Removed console message to prevent JSON contamination in Claude Desktop
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});