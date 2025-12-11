import dotenv from 'dotenv';
import os from 'os';

// Load environment variables silently (no debug output)
dotenv.config({ debug: false });

import express from "express";
import cors from "cors";
import { PostgresAdapter } from "./postgresAdapter.js";
import { MySQLAdapter } from "./mysqlAdapter.js";
import { MongoAdapter } from "./mongoAdapter.js";
import { SharedContextStorage } from "./sharedContextStorage.js";
import { ProfileManager } from "./profileManager.js";
import { 
  validateInput,
  UnifiedQuerySchema, 
  GetDatabaseSchemaSchema,
  ListDatabaseTablesSchema,
  ExportSchemaForCodegenSchema,
  AnalyzeIntentSchema,
  GeneratePreviewSchema,
  CreateWorkflowContextSchema,
  ListContextsSchema,
  SearchContextsSchema,
  GetContextSchema
} from "./inputValidator.js";

const app = express();
app.use(express.json());
app.use(cors()); // Allow cross-origin requests from VS Code extension

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

// Initialize profile manager
const profileManager = new ProfileManager();

// Profile manager paths configured silently

// Use shared context storage (same as MCP server)
const sharedStorage = new SharedContextStorage();

// Context management functions (copied from mcp-server.ts)
function analyzeUserIntent(userRequest: string, database: string, framework: string) {
  // Simple analysis - could be enhanced with NLP
  const tables = extractTableNamesFromRequest(userRequest);
  
  return {
    originalRequest: userRequest,
    database,
    framework,
    detectedTables: tables,
    complexity: tables.length > 3 ? 'complex' : 'medium',
    suggestedEndpoints: tables.map(table => `/${table.toLowerCase()}`),
    features: extractFeaturesFromRequest(userRequest)
  };
}

function extractTableNamesFromRequest(request: string): string[] {
  const commonWords = ['user', 'product', 'order', 'customer', 'category', 'payment', 'inventory'];
  return commonWords.filter(word => 
    request.toLowerCase().includes(word) || request.toLowerCase().includes(word + 's')
  );
}

function extractFeaturesFromRequest(request: string): string[] {
  const features = [];
  if (request.toLowerCase().includes('auth')) features.push('authentication');
  if (request.toLowerCase().includes('crud')) features.push('crud-operations');
  if (request.toLowerCase().includes('api')) features.push('rest-api');
  return features;
}

function createWorkflowContext(contextName: string, intentAnalysis: any, previewData?: any, expiresInMinutes: number = 60) {
  return sharedStorage.createContext(contextName, intentAnalysis, previewData, expiresInMinutes);
}

function listWorkflowContexts(includeExpired: boolean = false) {
  return sharedStorage.listContexts(includeExpired);
}

function getWorkflowContext(contextName: string) {
  return sharedStorage.getContext(contextName);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'DevOmni HTTP server is running', port: 3000 });
});

// MCP Tool endpoint for VS Code extension
app.post("/mcp-tool", async (req, res) => {
  const { toolName, arguments: args } = req.body;
  
  // Request processed silently
  
  try {
    let result;
    
    switch (toolName) {
      case "unified_query": {
        const validatedArgs = validateInput(UnifiedQuerySchema, args);
        const { database, query, collection, filter, projection } = validatedArgs;
        
        if (database === "postgres") {
          const queryResult = await pgDb.query(query!);
          result = { content: [{ type: "text", text: JSON.stringify(queryResult.rows, null, 2) }] };
        } else if (database === "mysql") {
          const queryResult = await mysqlDb.query(query!);
          result = { content: [{ type: "text", text: JSON.stringify(queryResult.rows, null, 2) }] };
        } else if (database === "mongo") {
          const rows = await mongoDb.find(collection!, filter, projection);
          result = { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        }
        break;
      }
      
      case "get_database_schema": {
        const validatedArgs = validateInput(GetDatabaseSchemaSchema, args);
        const { database, table_name, include_sample_data } = validatedArgs;
        
        let schemaResult;
        if (database === "postgres") {
          schemaResult = await getPostgresSchema(table_name, include_sample_data);
        } else if (database === "mysql") {
          schemaResult = await getMySQLSchema(table_name, include_sample_data);
        } else if (database === "mongo") {
          schemaResult = await getMongoSchema(table_name, include_sample_data);
        }
        
        result = { content: [{ type: "text", text: JSON.stringify(schemaResult, null, 2) }] };
        break;
      }
      
      case "list_database_tables": {
        const validatedArgs = validateInput(ListDatabaseTablesSchema, args);
        const { database, include_row_counts } = validatedArgs;
        
        let tablesResult;
        if (database === "postgres") {
          tablesResult = await getPostgresTables(include_row_counts);
        } else if (database === "mysql") {
          tablesResult = await getMySQLTables(include_row_counts);
        } else if (database === "mongo") {
          tablesResult = await getMongoTables(include_row_counts);
        }
        
        result = { content: [{ type: "text", text: JSON.stringify(tablesResult, null, 2) }] };
        break;
      }
      
      case "export_schema_for_codegen": {
        const validatedArgs = validateInput(ExportSchemaForCodegenSchema, args);
        const { database, target_framework, include_relationships } = validatedArgs;
        
        let codegenSchema;
        if (database === "postgres") {
          codegenSchema = await exportPostgresForCodegen(target_framework, include_relationships);
        } else if (database === "mysql") {
          codegenSchema = await exportMySQLForCodegen(target_framework, include_relationships);
        } else if (database === "mongo") {
          codegenSchema = await exportMongoForCodegen(target_framework, include_relationships);
        }
        
        result = { content: [{ type: "text", text: JSON.stringify(codegenSchema, null, 2) }] };
        break;
      }
      
      case "analyze_intent": {
        const validatedArgs = validateInput(AnalyzeIntentSchema, args);
        const { user_request, database, framework } = validatedArgs;
        
        const analysis = analyzeUserIntent(user_request, database, framework || "generic");
        result = { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
        break;
      }
      
      case "create_workflow_context": {
        const validatedArgs = validateInput(CreateWorkflowContextSchema, args);
        const { context_name, intent_analysis, preview_data, expires_in_minutes } = validatedArgs;
        
        const context = createWorkflowContext(context_name, intent_analysis, preview_data, expires_in_minutes || 60);
        result = { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
        break;
      }
      
      case "list_contexts": {
        const validatedArgs = validateInput(ListContextsSchema, args);
        const { include_expired } = validatedArgs;
        
        const contexts = listWorkflowContexts(include_expired || false);
        result = { content: [{ type: "text", text: JSON.stringify({ contexts }, null, 2) }] };
        break;
      }
      
      case "get_context": {
        const validatedArgs = validateInput(GetContextSchema, args);
        const { context_name } = validatedArgs;
        
        const context = getWorkflowContext(context_name);
        result = { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
        break;
      }

      case "list_profiles": {
        const profileInfo = await profileManager.getProfileInfo();
        const activeProfile = await profileManager.getActiveProfile();
        const allProfiles = await profileManager.getAllProfiles();
        
        // Debug logging
        // Profile information retrieved
        
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            profiles: profileInfo, 
            activeProfile,
            isValidProject: profileManager.isValidProject()
          }, null, 2) 
        }] };
        break;
      }

      case "get_active_profile": {
        const activeProfile = await profileManager.getActiveProfile();
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify({ activeProfile }, null, 2) 
        }] };
        break;
      }

      case "list_connection_profiles": {
        const allProfiles = await profileManager.getAllProfiles();
        const profiles = Object.entries(allProfiles.profiles).map(([name, config]) => ({
          name,
          databases: Object.keys(config).filter(db => config[db as keyof typeof config]),
          isActive: name === allProfiles.activeProfile,
          source: 'project'
        }));
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify(profiles, null, 2) 
        }] };
        break;
      }

      case "switch_profile": {
        // Accept both profileName and profile_name for compatibility
        const profileName = (args as any).profileName || (args as any).profile_name;
        if (!profileName) {
          throw new Error("Profile name is required");
        }
        await profileManager.setActiveProfile(profileName);
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify({ success: true, activeProfile: profileName }, null, 2) 
        }] };
        break;
      }

      case "create_profile": {
        const { profileName, config } = args as { profileName: string; config: any };
        if (!profileName) {
          throw new Error("Profile name is required");
        }
        
        // Allow empty config - databases are optional
        const databaseConfig = config || {};
        
        // Ensure config matches DatabaseProfile interface
        const validatedConfig = {
          postgres: databaseConfig.postgres || undefined,
          mysql: databaseConfig.mysql || undefined,
          mongo: databaseConfig.mongo || undefined
        };
        
        await profileManager.createProfile(profileName, validatedConfig);
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify({ success: true, profileName, config: validatedConfig }, null, 2) 
        }] };
        break;
      }

      case "delete_profile": {
        // Accept both profileName and profile_name for compatibility
        const profileName = (args as any).profileName || (args as any).profile_name;
        if (!profileName) {
          throw new Error("Profile name is required");
        }
        await profileManager.deleteProfile(profileName);
        result = { content: [{ 
          type: "text", 
          text: JSON.stringify({ success: true, deletedProfile: profileName }, null, 2) 
        }] };
        break;
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    
    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ HTTP Server Error:');
    console.error('  Error:', errorMessage);
    console.error('  Stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('  Tool Name:', toolName);
    console.error('  Arguments:', JSON.stringify(args, null, 2));
    res.status(500).json({ error: errorMessage });
  }
});

// Legacy endpoints
app.post("/query", async (req, res) => {
  const { sql, params } = req.body;
  try {
    const result = await pgDb.query(sql, params);
    res.json(result.rows);
  } catch (e: unknown) {
    if (e instanceof Error) {
      res.status(500).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Unknown error" });
    }
  }
});

app.get("/schema", async (req, res) => {
  const result = await pgDb.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  );
  res.json(result.rows);
});

app.get("/test-connection", async (req, res) => {
  try {
    await pgDb.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error) {
      res.status(500).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Unknown error" });
    }
  }
});

// Schema helper functions (copied from mcp-server.ts)
async function getPostgresSchema(tableName?: string, includeSampleData = false) {
  // Implementation same as in mcp-server.ts
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

  const result = await pgDb.query(query, params);
  return organizeSchemaData(result.rows, 'postgres');
}

async function getMySQLSchema(tableName?: string, includeSampleData = false) {
  // Simplified implementation
  let query = `
    SELECT 
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns 
    WHERE table_schema = DATABASE()
  `;
  
  if (tableName) {
    query += ` AND table_name = ?`;
    const result = await mysqlDb.query(query, [tableName]);
    return organizeSchemaData((result as any).rows || result, 'mysql');
  } else {
    const result = await mysqlDb.query(query);
    return organizeSchemaData((result as any).rows || result, 'mysql');
  }
}

async function getMongoSchema(collectionName?: string, includeSampleData = false) {
  const collections = collectionName ? [collectionName] : await mongoDb.listCollections();
  const schema: any = {};
  
  for (const collection of collections) {
    const sampleDocs = await mongoDb.find(collection, {});
    schema[collection] = {
      type: 'collection',
      fields: inferMongoSchema(sampleDocs.slice(0, 5)),
      documentCount: sampleDocs.length
    };
  }
  
  return schema;
}

async function getPostgresTables(includeRowCounts = false) {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  
  const result = await pgDb.query(query);
  const tables = result.rows.map((row: any) => ({ name: row.table_name, type: 'table' }));
  return { database: 'postgres', tables };
}

async function getMySQLTables(includeRowCounts = false) {
  // Use SHOW TABLES which is simpler and more reliable
  const query = "SHOW TABLES";
  
  const result = await mysqlDb.query(query);
  const rows = (result as any).rows || result;
  
  // MySQL SHOW TABLES returns different column names based on database
  // Extract table names from the result regardless of column name
  const tables = rows.map((row: any) => {
    const tableName = Object.values(row)[0] as string; // Get first column value
    return { name: tableName, type: 'table' };
  });
  
  return { database: 'mysql', tables };
}

async function getMongoTables(includeRowCounts = false) {
  const collections = await mongoDb.listCollections();
  const tables = collections.map(name => ({ name, type: 'collection' }));
  return { database: 'mongo', tables };
}

async function exportPostgresForCodegen(targetFramework = 'generic', includeRelationships = true) {
  const schema = await getPostgresSchema();
  return formatSchemaForCodegen(schema, 'postgres', targetFramework, includeRelationships);
}

async function exportMySQLForCodegen(targetFramework = 'generic', includeRelationships = true) {
  const schema = await getMySQLSchema();
  return formatSchemaForCodegen(schema, 'mysql', targetFramework, includeRelationships);
}

async function exportMongoForCodegen(targetFramework = 'generic', includeRelationships = true) {
  const schema = await getMongoSchema();
  return formatSchemaForCodegen(schema, 'mongo', targetFramework, includeRelationships);
}

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
      key: row.constraint_type
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
  
  // Convert sets to arrays
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
  for (const [tableName] of Object.entries(schema) as any) {
    result.suggestions.endpoints.push(`GET /api/${tableName}`);
    result.suggestions.endpoints.push(`POST /api/${tableName}`);
    result.suggestions.endpoints.push(`PUT /api/${tableName}/:id`);
    result.suggestions.endpoints.push(`DELETE /api/${tableName}/:id`);
  }
  
  return result;
}

app.listen(3000, () => console.log("DevOmni HTTP server running on port 3000"));
