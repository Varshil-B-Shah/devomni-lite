import { z } from 'zod';

// Security: MongoDB dangerous operators that should be blocked
const DANGEROUS_MONGO_OPERATORS = [
  '$where',           // Allows arbitrary JavaScript execution
  '$javascript',      // JavaScript execution
  '$eval',           // Deprecated but still dangerous
  '$function',       // Server-side JavaScript functions
  '$accumulator',    // Can contain JavaScript
  '$jsonSchema'      // Can be used for information disclosure
];

// Security: SQL patterns that might be dangerous (for logging/monitoring)
const SUSPICIOUS_SQL_PATTERNS = [
  /\b(drop|truncate|delete.*from.*information_schema|alter.*system)\b/i,
  /\b(create.*user|grant|revoke|load_file|into.*outfile)\b/i,
  /\b(union.*select|benchmark|sleep|waitfor)\b/i
];

/**
 * Validates MongoDB collection names
 * Prevents path traversal and ensures valid collection naming
 */
const CollectionNameSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Collection name contains invalid characters")
  .refine(name => !name.startsWith('.'), "Collection name cannot start with .")
  .refine(name => !name.includes('..'), "Collection name cannot contain '..'")
  .refine(name => name !== 'system.indexes', "Cannot access system collections");

/**
 * Recursively validates MongoDB filter objects for dangerous operators
 */
function validateMongoFilter(filter: unknown, path = 'filter'): void {
  if (filter === null || filter === undefined) {
    return;
  }

  if (typeof filter !== 'object') {
    return;
  }

  if (Array.isArray(filter)) {
    filter.forEach((item, index) => 
      validateMongoFilter(item, `${path}[${index}]`)
    );
    return;
  }

  // Check each key in the object
  for (const [key, value] of Object.entries(filter)) {
    // Security: Block dangerous operators
    if (DANGEROUS_MONGO_OPERATORS.includes(key)) {
      throw new Error(`Security: Dangerous MongoDB operator '${key}' is not allowed at ${path}.${key}`);
    }

    // Security: Validate $regex patterns don't contain dangerous flags
    if (key === '$regex' && typeof value === 'object' && value !== null) {
      const regexObj = value as any;
      if (regexObj.$options && typeof regexObj.$options === 'string') {
        // Block 'e' flag which allows code execution in some contexts
        if (regexObj.$options.includes('e')) {
          throw new Error(`Security: Dangerous regex option 'e' is not allowed at ${path}.${key}`);
        }
      }
    }

    // Security: Validate $expr doesn't contain dangerous operations
    if (key === '$expr' && typeof value === 'object' && value !== null) {
      const exprStr = JSON.stringify(value);
      if (DANGEROUS_MONGO_OPERATORS.some(op => exprStr.includes(op))) {
        throw new Error(`Security: Dangerous operator found in $expr at ${path}.${key}`);
      }
    }

    // Recursively validate nested objects
    validateMongoFilter(value, `${path}.${key}`);
  }
}

/**
 * MongoDB Filter Schema with security validation
 */
const MongoFilterSchema = z.unknown()
  .optional()
  .default({})
  .refine((filter) => {
    try {
      validateMongoFilter(filter);
      return true;
    } catch (error) {
      throw error;
    }
  }, "Invalid MongoDB filter");

/**
 * MongoDB Projection Schema with security validation
 */
const MongoProjectionSchema = z.unknown()
  .optional()
  .default({})
  .refine((projection) => {
    if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
      return true;
    }
    
    // Basic validation for projection - ensure values are 0, 1, or valid operators
    for (const [key, value] of Object.entries(projection)) {
      if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'object') {
        throw new Error(`Invalid projection value for field '${key}': must be 0, 1, or projection operator`);
      }
    }
    return true;
  }, "Invalid MongoDB projection");

/**
 * SQL Query Schema with basic validation
 */
const SQLQuerySchema = z.string()
  .min(1, "SQL query cannot be empty")
  .max(10000, "SQL query too long (max 10000 characters)")
  .refine((sql) => {
    // Log suspicious patterns for monitoring (but allow them)
    const suspicious = SUSPICIOUS_SQL_PATTERNS.some(pattern => pattern.test(sql));
    if (suspicious) {
      console.warn(`[SECURITY] Suspicious SQL pattern detected: ${sql.substring(0, 100)}...`);
    }
    return true;
  }, "Invalid SQL query");

/**
 * Unified Query Input Schema
 */
export const UnifiedQuerySchema = z.object({
  database: z.enum(['postgres', 'mysql', 'mongo'], {
    errorMap: () => ({ message: "Database must be 'postgres', 'mysql', or 'mongo'" })
  }),
  query: SQLQuerySchema.optional(),
  collection: CollectionNameSchema.optional(),
  filter: MongoFilterSchema,
  projection: MongoProjectionSchema
}).superRefine((data, ctx) => {
  // Validate required fields based on database type
  if (data.database === 'mongo') {
    if (!data.collection) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Collection name is required for MongoDB queries",
        path: ['collection']
      });
    }
  } else {
    // SQL databases
    if (!data.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SQL query is required for PostgreSQL/MySQL",
        path: ['query']
      });
    }
  }
});

/**
 * Compare Databases Input Schema
 */
export const CompareDatabasesSchema = z.object({
  db1: z.enum(['postgres', 'mysql', 'mongo']),
  db2: z.enum(['postgres', 'mysql', 'mongo']),
  query1: SQLQuerySchema.optional(),
  query2: SQLQuerySchema.optional(),
  collection1: CollectionNameSchema.optional(),
  collection2: CollectionNameSchema.optional(),
  filter1: MongoFilterSchema,
  filter2: MongoFilterSchema
}).superRefine((data, ctx) => {
  // Validate db1 requirements
  if (data.db1 === 'mongo') {
    if (!data.collection1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Collection name is required for MongoDB (db1)",
        path: ['collection1']
      });
    }
  } else if (!data.query1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SQL query is required for db1",
      path: ['query1']
    });
  }

  // Validate db2 requirements
  if (data.db2 === 'mongo') {
    if (!data.collection2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Collection name is required for MongoDB (db2)",
        path: ['collection2']
      });
    }
  } else if (!data.query2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SQL query is required for db2",
      path: ['query2']
    });
  }
});

/**
 * Get Database Schema Input Schema
 */
export const GetDatabaseSchemaSchema = z.object({
  database: z.enum(['postgres', 'mysql', 'mongo'], {
    errorMap: () => ({ message: "Database must be 'postgres', 'mysql', or 'mongo'" })
  }),
  table_name: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Table name contains invalid characters")
    .optional(),
  include_sample_data: z.boolean().optional().default(false)
});

/**
 * List Database Tables Input Schema
 */
export const ListDatabaseTablesSchema = z.object({
  database: z.enum(['postgres', 'mysql', 'mongo'], {
    errorMap: () => ({ message: "Database must be 'postgres', 'mysql', or 'mongo'" })
  }),
  include_row_counts: z.boolean().optional().default(false)
});

/**
 * Export Schema for Codegen Input Schema
 */
export const ExportSchemaForCodegenSchema = z.object({
  database: z.enum(['postgres', 'mysql', 'mongo'], {
    errorMap: () => ({ message: "Database must be 'postgres', 'mysql', or 'mongo'" })
  }),
  target_framework: z.enum(['express', 'nextjs', 'fastapi', 'nestjs', 'generic']).optional().default('generic'),
  include_relationships: z.boolean().optional().default(true)
});

/**
 * Utility function to validate and sanitize inputs
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ).join('; ');
      throw new Error(`Input validation failed: ${messages}`);
    }
    throw error;
  }
}

/**
 * Security logging utility
 */
export function logSecurityEvent(event: string, details: any) {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY ${timestamp}] ${event}:`, JSON.stringify(details, null, 2));
}