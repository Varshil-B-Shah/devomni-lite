import * as vscode from 'vscode';
import { McpClient } from './mcpClient';

/**
 * Configuration Manager for DevOmni Projects
 * 
 * WHY THIS APPROACH:
 * 1. Centralized configuration logic - easier to maintain
 * 2. Type-safe configuration with interfaces
 * 3. Validation at the configuration level
 * 4. Easy testing and mocking
 * 
 * ALTERNATIVES CONSIDERED:
 * - Direct vscode.workspace.getConfiguration() calls throughout code
 *   ❌ Problem: Scattered configuration logic, hard to maintain
 * - Global configuration object
 *   ❌ Problem: Not workspace-specific, state management issues
 */

export interface ProjectConfig {
    database: 'postgres' | 'mysql' | 'mongo';
    connectionProfile: string;
    targetFramework: 'nextjs' | 'express' | 'nestjs' | 'fastapi' | 'generic';
    outputDirectory: string;
    mcpServerUrl: string;
}

export interface ConnectionProfile {
    name: string;
    database: 'postgres' | 'mysql' | 'mongo';
    displayName: string;
    description?: string;
}

export class ConfigManager {
    private static readonly CONFIG_SECTION = 'devomni';
    
    constructor(private mcpClient: McpClient) {}

    /**
     * Get current project configuration
     * 
     * WHY VSCODE WORKSPACE CONFIGURATION:
     * - Automatically handles workspace vs user vs default settings precedence
     * - Built-in VS Code setting inheritance and overrides
     * - Integrates with VS Code settings UI
     * - Supports different config per workspace (multi-project support)
     * 
     * ALTERNATIVE: Custom config files (.devomni.json)
     * ❌ Problem: Have to implement our own precedence logic
     * ❌ Problem: Doesn't integrate with VS Code settings UI
     * ❌ Problem: Users familiar with VS Code expect workspace settings
     */
    getCurrentConfig(): ProjectConfig {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        
        return {
            database: config.get('database', 'postgres'),
            connectionProfile: config.get('connectionProfile', 'default'),
            targetFramework: config.get('targetFramework', 'nextjs'),
            outputDirectory: config.get('outputDirectory', 'generated'),
            mcpServerUrl: config.get('mcpServerUrl', 'http://localhost:3000')
        };
    }

    /**
     * Update project configuration
     * 
     * WHY WORKSPACE TARGET:
     * - Changes only affect current workspace/project
     * - Enables different configs for different projects
     * - Doesn't pollute user's global VS Code settings
     * 
     * ALTERNATIVE: User or Global target
     * ❌ Problem: Would affect all projects globally
     * ❌ Problem: Can't have project-specific database connections
     */
    async updateConfig(updates: Partial<ProjectConfig>): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        
        for (const [key, value] of Object.entries(updates)) {
            await config.update(key, value, vscode.ConfigurationTarget.Workspace);
        }
        
        vscode.window.showInformationMessage(`DevOmni configuration updated!`);
    }

    /**
     * Get available connection profiles from MCP server
     * 
     * WHY FETCH FROM MCP SERVER:
     * - Single source of truth for available connections
     * - MCP server has access to actual .env file
     * - Profiles automatically sync when .env changes
     * - No duplication of connection info
     * 
     * ALTERNATIVE: Hardcode profiles in extension
     * ❌ Problem: Gets out of sync with actual connections
     * ❌ Problem: Users have to configure profiles twice
     * ❌ Problem: Can't validate if connection actually exists
     */
    async getAvailableProfiles(): Promise<ConnectionProfile[]> {
        try {
            // This will be a new MCP tool we'll implement
            const response = await this.mcpClient.callTool('list_connection_profiles', {});
            
            return JSON.parse(response.content[0].text);
        } catch (error) {
            console.warn('Could not fetch connection profiles, using defaults:', error);
            
            // Fallback to default profiles
            return [
                { name: 'default', database: 'postgres', displayName: 'Default PostgreSQL' },
                { name: 'default', database: 'mysql', displayName: 'Default MySQL' },
                { name: 'default', database: 'mongo', displayName: 'Default MongoDB' }
            ];
        }
    }

    /**
     * Test current configuration connection
     * 
     * WHY SEPARATE TEST METHOD:
     * - Immediate feedback on configuration changes
     * - Helps users debug connection issues
     * - Validates setup before attempting code generation
     * 
     * ALTERNATIVE: Test connection during code generation
     * ❌ Problem: User only finds out about connection issues during generation
     * ❌ Problem: Wastes time if configuration is wrong
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const config = this.getCurrentConfig();
            
            // Test MCP server connection
            const isServerAlive = await this.mcpClient.testConnection();
            if (!isServerAlive) {
                return {
                    success: false,
                    message: `Cannot connect to DevOmni MCP server at ${config.mcpServerUrl}. Is the server running?`
                };
            }

            // Test database connection through MCP server
            const tables = await this.mcpClient.listTables(config.database, false);
            
            return {
                success: true,
                message: `✅ Connected to ${config.database} (${config.connectionProfile}) - Found ${tables.tables.length} tables`
            };
            
        } catch (error) {
            return {
                success: false,
                message: `❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Detect project type and suggest configuration
     * 
     * WHY AUTO-DETECTION:
     * - Better user experience - smart defaults
     * - Reduces manual configuration steps
     * - Learns from common project patterns
     * 
     * ALTERNATIVE: Always ask user for all settings
     * ❌ Problem: Too many questions, overwhelming
     * ❌ Problem: Most projects follow standard patterns
     */
    detectProjectType(): Partial<ProjectConfig> {
        const suggestions: Partial<ProjectConfig> = {};
        
        // Check for Next.js
        if (this.hasFile('next.config.js') || this.hasFile('next.config.ts')) {
            suggestions.targetFramework = 'nextjs';
            suggestions.outputDirectory = 'src/generated';
        }
        
        // Check for Express
        if (this.hasPackageDependency('express')) {
            suggestions.targetFramework = 'express';
            suggestions.outputDirectory = 'src/routes/generated';
        }
        
        // Check for NestJS
        if (this.hasPackageDependency('@nestjs/core')) {
            suggestions.targetFramework = 'nestjs';
            suggestions.outputDirectory = 'src/generated';
        }
        
        // Check for FastAPI
        if (this.hasFile('requirements.txt') || this.hasFile('pyproject.toml')) {
            suggestions.targetFramework = 'fastapi';
            suggestions.outputDirectory = 'generated';
        }
        
        // Check for existing database connections in project
        const dbSuggestion = this.detectDatabaseType();
        if (dbSuggestion) {
            suggestions.database = dbSuggestion;
        }
        
        return suggestions;
    }

    private hasFile(filename: string): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return false;
        
        try {
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, filename);
            vscode.workspace.fs.stat(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private hasPackageDependency(packageName: string): boolean {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return false;
            
            const packageJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
            // This would need to be implemented with file reading
            // For now, return false as we'd need async file operations
            return false;
        } catch {
            return false;
        }
    }

    private detectDatabaseType(): 'postgres' | 'mysql' | 'mongo' | null {
        // Check common database connection patterns in project files
        // This is simplified - would check .env, config files, etc.
        return null;
    }

    /**
     * Get configuration status for status bar
     * 
     * WHY STATUS BAR:
     * - Always visible current configuration
     * - Quick access to change settings
     * - Shows when configuration might be missing
     * 
     * ALTERNATIVE: Only show config in command palette
     * ❌ Problem: Users forget current configuration
     * ❌ Problem: Hard to quickly see what's configured
     */
    getStatusBarText(): string {
        const config = this.getCurrentConfig();
        return `DevOmni: ${config.database} (${config.connectionProfile})`;
    }
}