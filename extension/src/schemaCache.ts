import * as vscode from 'vscode';
import * as path from 'path';
import { DatabaseSchema } from './mcpClient';

interface CacheEntry {
    schema: DatabaseSchema;
    timestamp: number;
    ttl: number;
}

export class SchemaCache {
    private cache: Map<string, CacheEntry> = new Map();
    private context: vscode.ExtensionContext;
    private readonly CACHE_DIR = '.devomni';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    getSchema(database: string): DatabaseSchema | null {
        const entry = this.cache.get(database);
        if (!entry) {
            return null;
        }

        // Check if cache is expired
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(database);
            return null;
        }

        return entry.schema;
    }

    setSchema(database: string, schema: DatabaseSchema, ttl?: number): void {
        const config = vscode.workspace.getConfiguration('devomni');
        const defaultTtl = config.get('schemaCache.ttl') as number || 300000; // 5 minutes default
        
        const entry: CacheEntry = {
            schema,
            timestamp: Date.now(),
            ttl: ttl || defaultTtl
        };

        this.cache.set(database, entry);
    }

    invalidateCache(database?: string): void {
        if (database) {
            this.cache.delete(database);
        } else {
            this.cache.clear();
        }
    }

    async saveToFile(database: string, schema: DatabaseSchema): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.warn('No workspace folder found, cannot save schema to file');
                return;
            }

            const cacheDir = vscode.Uri.joinPath(workspaceFolder.uri, this.CACHE_DIR);
            
            // Create .devomni directory if it doesn't exist
            try {
                await vscode.workspace.fs.createDirectory(cacheDir);
            } catch (error) {
                // Directory might already exist, ignore error
            }

            // Save schema to file
            const schemaFile = vscode.Uri.joinPath(cacheDir, `${database}-schema.json`);
            const schemaContent = JSON.stringify({
                ...schema,
                cachedAt: new Date().toISOString()
            }, null, 2);

            await vscode.workspace.fs.writeFile(schemaFile, Buffer.from(schemaContent));

            // Save table list for quick reference
            const tablesFile = vscode.Uri.joinPath(cacheDir, `${database}-tables.json`);
            const tableNames = Object.keys(schema.tables || {});
            const tablesContent = JSON.stringify({
                database,
                tables: tableNames,
                count: tableNames.length,
                cachedAt: new Date().toISOString()
            }, null, 2);

            await vscode.workspace.fs.writeFile(tablesFile, Buffer.from(tablesContent));

        } catch (error) {
            console.error('Failed to save schema to file:', error);
            throw new Error(`Failed to save schema to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async loadFromFile(database: string): Promise<DatabaseSchema | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return null;
            }

            const schemaFile = vscode.Uri.joinPath(workspaceFolder.uri, this.CACHE_DIR, `${database}-schema.json`);
            
            try {
                const content = await vscode.workspace.fs.readFile(schemaFile);
                const schema = JSON.parse(content.toString()) as DatabaseSchema & { cachedAt: string };
                
                // Check if file cache is still valid (within TTL)
                const config = vscode.workspace.getConfiguration('devomni');
                const ttl = config.get('schemaCache.ttl') as number || 300000;
                const cachedAt = new Date(schema.cachedAt);
                const now = new Date();
                
                if (now.getTime() - cachedAt.getTime() > ttl) {
                    // Cache expired
                    return null;
                }

                // Update in-memory cache
                this.setSchema(database, schema);
                return schema;
                
            } catch (error) {
                // File doesn't exist or is corrupted
                return null;
            }

        } catch (error) {
            console.error('Failed to load schema from file:', error);
            return null;
        }
    }

    async getCacheInfo(): Promise<{ [database: string]: { age: number; size: number } }> {
        const info: { [database: string]: { age: number; size: number } } = {};
        
        for (const [database, entry] of this.cache.entries()) {
            info[database] = {
                age: Date.now() - entry.timestamp,
                size: JSON.stringify(entry.schema).length
            };
        }

        return info;
    }

    async getCacheDirectory(): Promise<vscode.Uri | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        return vscode.Uri.joinPath(workspaceFolder.uri, this.CACHE_DIR);
    }

    async clearFileCache(): Promise<void> {
        try {
            const cacheDir = await this.getCacheDirectory();
            if (!cacheDir) {
                return;
            }

            // List all files in cache directory
            const files = await vscode.workspace.fs.readDirectory(cacheDir);
            
            // Delete schema and table files
            for (const [filename] of files) {
                if (filename.endsWith('-schema.json') || filename.endsWith('-tables.json')) {
                    const filePath = vscode.Uri.joinPath(cacheDir, filename);
                    await vscode.workspace.fs.delete(filePath);
                }
            }

        } catch (error) {
            console.error('Failed to clear file cache:', error);
        }
    }

    // Utility method to get cached table names quickly
    async getTableNames(database: string): Promise<string[]> {
        const schema = this.getSchema(database);
        if (schema) {
            return Object.keys(schema.tables || {});
        }

        // Try to load from file
        const loadedSchema = await this.loadFromFile(database);
        if (loadedSchema) {
            return Object.keys(loadedSchema.tables || {});
        }

        return [];
    }

    // Method to preload schemas for all configured databases
    async preloadSchemas(): Promise<void> {
        const config = vscode.workspace.getConfiguration('devomni');
        const database = config.get('database') as string;

        if (database) {
            await this.loadFromFile(database);
        }
    }
}