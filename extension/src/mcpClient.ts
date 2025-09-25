import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';

export interface DatabaseSchema {
    database: string;
    targetFramework?: string;
    generatedAt: string;
    tables: { [tableName: string]: TableSchema };
    suggestions?: {
        endpoints: string[];
        types: string[];
        validations: string[];
    };
}

export interface TableSchema {
    type: 'table' | 'collection';
    columns?: { [columnName: string]: ColumnSchema };
    fields?: { [fieldName: string]: FieldSchema };
    sampleData?: any[];
    documentCount?: number;
}

export interface ColumnSchema {
    type: string;
    nullable: boolean;
    default?: any;
    maxLength?: number;
    precision?: number;
    scale?: number;
    key?: string;
    references?: {
        table: string;
        column: string;
    };
}

export interface FieldSchema {
    types: string[];
    nullable: boolean;
    examples: any[];
}

export interface TableListResult {
    database: string;
    tables: Array<{
        name: string;
        type: string;
        rowCount?: number | string | null;
    }>;
}

export class McpClient {
    private baseUrl: string;
    private httpClient: AxiosInstance;

    constructor() {
        const config = vscode.workspace.getConfiguration('devomni');
        this.baseUrl = config.get('mcpServerUrl') || 'http://localhost:3000';
        
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            }
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.httpClient.get('/test-connection');
            return response.status === 200;
        } catch (error) {
            console.error('MCP server connection test failed:', error);
            return false;
        }
    }

    async listTables(database: string, includeRowCounts = false): Promise<TableListResult> {
        try {
            const payload = {
                name: 'list_database_tables',
                arguments: {
                    database,
                    include_row_counts: includeRowCounts
                }
            };

            const response = await this.callMcpTool(payload);
            return JSON.parse(response.content[0].text);
        } catch (error) {
            throw new Error(`Failed to list ${database} tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getFullSchema(database: string, tableName?: string, includeSampleData = false): Promise<DatabaseSchema> {
        try {
            const payload = {
                name: 'get_database_schema',
                arguments: {
                    database,
                    table_name: tableName,
                    include_sample_data: includeSampleData
                }
            };

            const response = await this.callMcpTool(payload);
            const schema = JSON.parse(response.content[0].text);
            
            return {
                database,
                generatedAt: new Date().toISOString(),
                tables: schema
            };
        } catch (error) {
            throw new Error(`Failed to get ${database} schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async exportSchemaForCodegen(
        database: string, 
        targetFramework = 'generic', 
        includeRelationships = true
    ): Promise<DatabaseSchema> {
        try {
            const payload = {
                name: 'export_schema_for_codegen',
                arguments: {
                    database,
                    target_framework: targetFramework,
                    include_relationships: includeRelationships
                }
            };

            const response = await this.callMcpTool(payload);
            return JSON.parse(response.content[0].text);
        } catch (error) {
            throw new Error(`Failed to export ${database} schema for codegen: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async queryDatabase(database: string, query: string, collection?: string, filter?: any, projection?: any): Promise<any> {
        try {
            const payload = {
                name: 'unified_query',
                arguments: {
                    database,
                    query,
                    collection,
                    filter,
                    projection
                }
            };

            const response = await this.callMcpTool(payload);
            return JSON.parse(response.content[0].text);
        } catch (error) {
            throw new Error(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async callMcpTool(payload: any): Promise<any> {
        try {
            // For HTTP server version, we'll use the /query endpoint
            // This assumes your server.ts is running alongside the MCP server
            const response = await this.httpClient.post('/mcp-tool', {
                tool: payload.name,
                args: payload.arguments
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    throw new Error(`Server error (${error.response.status}): ${error.response.data?.error || error.response.statusText}`);
                } else if (error.request) {
                    throw new Error('No response from DevOmni MCP server. Make sure it\'s running on ' + this.baseUrl);
                }
            }
            throw error;
        }
    }

    updateBaseUrl(newUrl: string): void {
        this.baseUrl = newUrl;
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            }
        });
    }
}