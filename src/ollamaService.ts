import { Ollama } from 'ollama';
import { logSecurityEvent } from './inputValidator.js';

/**
 * OllamaService - Handles AI validation and code generation using local Ollama
 * 
 * WHY THIS EXISTS:
 * - Provides FREE AI validation for database operations
 * - Runs locally for privacy and security
 * - Can analyze schemas and generate CLI tools
 * - No API costs or rate limits
 */
export class OllamaService {
  private ollama: Ollama;
  private defaultModel: string;
  
  constructor(host: string = 'http://localhost:11434', model: string = 'llama3.1') {
    // EXPLANATION: Initialize Ollama client
    // host: Where Ollama server is running (default local)
    // model: Which AI model to use (llama3.1 is good for code)
    this.ollama = new Ollama({ host });
    this.defaultModel = model;
  }
  
  /**
   * Check if Ollama is available and model is installed
   * WHY: We need to verify AI is ready before using it
   */
  async isAvailable(): Promise<boolean> {
    try {
      // EXPLANATION: Try to list available models to test connection
      const models = await this.ollama.list();
      const hasModel = models.models.some(m => m.name.includes(this.defaultModel));
      
      if (!hasModel) {
        console.warn(`[OLLAMA] Model ${this.defaultModel} not found. Available models:`, 
                     models.models.map(m => m.name));
      }
      
      return hasModel;
    } catch (error) {
      console.error('[OLLAMA] Connection failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }
  
  /**
   * Validate a SQL query for safety and correctness
   * WHY: AI reviews SQL before execution to prevent dangerous operations
   */
  async validateSQLQuery(query: string, database: 'postgres' | 'mysql'): Promise<ValidationResult> {
    const prompt = this.buildSQLValidationPrompt(query, database);
    
    try {
      // EXPLANATION: Send query to AI for analysis
      const response = await this.ollama.generate({
        model: this.defaultModel,
        prompt: prompt,
        options: {
          temperature: 0.1, // Low temperature for consistent validation
        }
      });
      
      // EXPLANATION: Parse AI response to determine if query is safe
      const result = this.parseSQLValidationResponse(response.response, query, database);
      
      // SECURITY: Log all validation attempts
      logSecurityEvent('ollama_sql_validation', {
        database,
        queryPreview: query.substring(0, 100),
        approved: result.approved,
        riskLevel: result.riskLevel
      });
      
      return result;
      
    } catch (error) {
      // EXPLANATION: If AI fails, default to rejection for safety
      console.error('[OLLAMA] SQL validation failed:', error);
      return {
        approved: false,
        riskLevel: 'high',
        reason: 'AI validation service unavailable',
        suggestions: ['Please try again when Ollama is available']
      };
    }
  }
  
  /**
   * Validate MongoDB operations for safety
   * WHY: AI reviews MongoDB queries to prevent injection attacks
   */
  async validateMongoOperation(collection: string, operation: any, operationType: string): Promise<ValidationResult> {
    const prompt = this.buildMongoValidationPrompt(collection, operation, operationType);
    
    try {
      const response = await this.ollama.generate({
        model: this.defaultModel,
        prompt: prompt,
        options: {
          temperature: 0.1,
        }
      });
      
      const result = this.parseMongoValidationResponse(response.response, collection, operation);
      
      // SECURITY: Log validation attempts
      logSecurityEvent('ollama_mongo_validation', {
        collection,
        operationType,
        approved: result.approved,
        riskLevel: result.riskLevel
      });
      
      return result;
      
    } catch (error) {
      console.error('[OLLAMA] MongoDB validation failed:', error);
      return {
        approved: false,
        riskLevel: 'high',
        reason: 'AI validation service unavailable',
        suggestions: ['Please try again when Ollama is available']
      };
    }
  }
  
  /**
   * Analyze database schema to understand structure
   * WHY: AI analyzes DB structure to generate appropriate CLI tools
   */
  async analyzeSchema(database: 'postgres' | 'mysql' | 'mongo', schemaInfo: any): Promise<SchemaAnalysis> {
    const prompt = this.buildSchemaAnalysisPrompt(database, schemaInfo);
    
    try {
      const response = await this.ollama.generate({
        model: this.defaultModel,
        prompt: prompt,
        options: {
          temperature: 0.2, // Slightly higher for creative CLI generation
        }
      });
      
      const analysis = this.parseSchemaAnalysis(response.response, database);
      
      logSecurityEvent('ollama_schema_analysis', {
        database,
        tablesCount: analysis.tables?.length || 0,
        suggestedCommands: analysis.suggestedCommands?.length || 0
      });
      
      return analysis;
      
    } catch (error) {
      console.error('[OLLAMA] Schema analysis failed:', error);
      return {
        database,
        tables: [],
        suggestedCommands: [],
        cliStructure: 'basic'
      };
    }
  }
  
  /**
   * Build prompt for SQL validation
   * WHY: Clear instructions help AI make better validation decisions
   */
  private buildSQLValidationPrompt(query: string, database: string): string {
    return `You are a database security expert. Analyze this ${database.toUpperCase()} query for safety and correctness.

QUERY TO ANALYZE:
${query}

ANALYSIS CRITERIA:
- Check for SQL injection attempts
- Identify potentially dangerous operations (DROP, TRUNCATE, ALTER SYSTEM, etc.)
- Verify syntax correctness for ${database}
- Assess data modification impact
- Look for performance issues

RESPONSE FORMAT (JSON):
{
  "approved": boolean,
  "riskLevel": "low" | "medium" | "high",
  "reason": "explanation of decision",
  "suggestions": ["improvement suggestions"],
  "safetyScore": 1-10
}

Be strict with validation. When in doubt, reject the query.`;
  }
  
  /**
   * Build prompt for MongoDB validation
   * WHY: MongoDB has different security concerns than SQL
   */
  private buildMongoValidationPrompt(collection: string, operation: any, operationType: string): string {
    return `You are a MongoDB security expert. Analyze this MongoDB operation for safety.

OPERATION DETAILS:
- Collection: ${collection}
- Type: ${operationType}
- Operation: ${JSON.stringify(operation, null, 2)}

SECURITY CHECKS:
- NoSQL injection attempts
- Dangerous operators ($where, $eval, $javascript, etc.)
- Resource exhaustion potential
- Data exposure risks
- Collection name validity

RESPONSE FORMAT (JSON):
{
  "approved": boolean,
  "riskLevel": "low" | "medium" | "high", 
  "reason": "explanation of decision",
  "suggestions": ["safety improvements"],
  "safetyScore": 1-10
}

Reject any operation with dangerous operators or injection attempts.`;
  }
  
  /**
   * Build prompt for schema analysis
   * WHY: AI needs context about database structure to generate useful CLI tools
   */
  private buildSchemaAnalysisPrompt(database: string, schemaInfo: any): string {
    return `You are a CLI tool generator. Analyze this ${database.toUpperCase()} database schema and suggest CLI commands.

SCHEMA INFORMATION:
${JSON.stringify(schemaInfo, null, 2)}

GENERATE:
- Useful CLI commands for this database
- CRUD operations for each table/collection
- Data export/import commands
- Schema management commands
- Backup/restore commands

RESPONSE FORMAT (JSON):
{
  "database": "${database}",
  "tables": [{"name": "table_name", "primaryKey": "id", "columns": [...]}],
  "suggestedCommands": [
    {
      "name": "command-name",
      "description": "what it does",
      "usage": "command usage example",
      "category": "crud|admin|export|import"
    }
  ],
  "cliStructure": "basic" | "advanced"
}

Focus on practical, commonly-used database operations.`;
  }
  
  /**
   * Parse AI response for SQL validation
   * WHY: Convert AI text response into structured validation result
   */
  private parseSQLValidationResponse(response: string, query: string, database: string): ValidationResult {
    try {
      // EXPLANATION: Try to parse JSON response from AI
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: parsed.approved || false,
          riskLevel: parsed.riskLevel || 'high',
          reason: parsed.reason || 'No specific reason provided',
          suggestions: parsed.suggestions || [],
          safetyScore: parsed.safetyScore
        };
      }
    } catch (error) {
      console.warn('[OLLAMA] Failed to parse validation response:', error);
    }
    
    // FALLBACK: If parsing fails, be conservative and reject
    return {
      approved: false,
      riskLevel: 'high',
      reason: 'Unable to parse AI validation response',
      suggestions: ['Please try again or review query manually']
    };
  }
  
  /**
   * Parse AI response for MongoDB validation
   */
  private parseMongoValidationResponse(response: string, collection: string, operation: any): ValidationResult {
    // Same parsing logic as SQL but for MongoDB context
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: parsed.approved || false,
          riskLevel: parsed.riskLevel || 'high',
          reason: parsed.reason || 'No specific reason provided',
          suggestions: parsed.suggestions || [],
          safetyScore: parsed.safetyScore
        };
      }
    } catch (error) {
      console.warn('[OLLAMA] Failed to parse MongoDB validation response:', error);
    }
    
    return {
      approved: false,
      riskLevel: 'high',
      reason: 'Unable to parse AI validation response',
      suggestions: ['Please try again or review operation manually']
    };
  }
  
  /**
   * Parse AI response for schema analysis
   */
  private parseSchemaAnalysis(response: string, database: string): SchemaAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          database,
          tables: parsed.tables || [],
          suggestedCommands: parsed.suggestedCommands || [],
          cliStructure: parsed.cliStructure || 'basic'
        };
      }
    } catch (error) {
      console.warn('[OLLAMA] Failed to parse schema analysis:', error);
    }
    
    // FALLBACK: Return basic structure if parsing fails
    return {
      database,
      tables: [],
      suggestedCommands: [],
      cliStructure: 'basic'
    };
  }
}

/**
 * TYPE DEFINITIONS
 * WHY: TypeScript types ensure our validation results are consistent
 */

export interface ValidationResult {
  approved: boolean;           // Whether operation is safe to execute
  riskLevel: 'low' | 'medium' | 'high';  // Risk assessment
  reason: string;              // Why approved/rejected
  suggestions: string[];       // How to improve the operation
  safetyScore?: number;        // Optional numeric safety rating
}

export interface SchemaAnalysis {
  database: string;
  tables: Array<{
    name: string;
    primaryKey?: string;
    columns?: string[];
  }>;
  suggestedCommands: Array<{
    name: string;
    description: string;
    usage: string;
    category: 'crud' | 'admin' | 'export' | 'import';
  }>;
  cliStructure: 'basic' | 'advanced';
}