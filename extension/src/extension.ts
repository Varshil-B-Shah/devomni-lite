import * as vscode from 'vscode';
import { McpClient } from './mcpClient'; 
import { SchemaCache } from './schemaCache'; 
import { CodeGenerator } from './codeGenerator';
import { ConfigManager } from './configManager';
import { ProjectSetupWizard } from './projectSetupWizard';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevOmni Code Generator extension is now active!');

    const mcpClient = new McpClient();
    const schemaCache = new SchemaCache(context);
    const codeGenerator = new CodeGenerator();
    const configManager = new ConfigManager(mcpClient);
    const projectSetupWizard = new ProjectSetupWizard(configManager);

    // Register commands
    const generateAPIsCommand = vscode.commands.registerCommand('devomni.generateAPIs', async () => {
        try {
            await generateAPIsHandler(mcpClient, schemaCache, codeGenerator);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate APIs: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const refreshSchemaCommand = vscode.commands.registerCommand('devomni.refreshSchema', async () => {
        try {
            await refreshSchemaHandler(mcpClient, schemaCache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const showSchemaCommand = vscode.commands.registerCommand('devomni.showSchema', async () => {
        try {
            await showSchemaHandler(schemaCache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const generateCRUDCommand = vscode.commands.registerCommand('devomni.generateCRUD', async () => {
        try {
            await generateCRUDHandler(mcpClient, schemaCache, codeGenerator);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate CRUD APIs: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const generateTypesCommand = vscode.commands.registerCommand('devomni.generateTypes', async () => {
        try {
            await generateTypesHandler(mcpClient, schemaCache, codeGenerator);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate types: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // New configuration commands
    const setupProjectCommand = vscode.commands.registerCommand('devomni.setupProject', async () => {
        try {
            await projectSetupWizard.startSetupWizard();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to setup project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const switchDatabaseCommand = vscode.commands.registerCommand('devomni.switchDatabase', async () => {
        try {
            const currentConfig = configManager.getCurrentConfig();
            const profiles = await configManager.getAvailableProfiles();
            
            const databaseTypes = [...new Set(profiles.map(p => p.database))];
            const selectedDatabase = await vscode.window.showQuickPick(databaseTypes, {
                placeHolder: 'Select database type',
                title: 'Switch Database Type'
            });

            if (selectedDatabase && ['postgres', 'mysql', 'mongo'].includes(selectedDatabase)) {
                await configManager.updateConfig({ database: selectedDatabase as 'postgres' | 'mysql' | 'mongo' });
                vscode.window.showInformationMessage(`Database switched to ${selectedDatabase}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to switch database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const switchFrameworkCommand = vscode.commands.registerCommand('devomni.switchFramework', async () => {
        try {
            const frameworks = ['express', 'nextjs', 'fastapi', 'nestjs', 'generic'];
            const selectedFramework = await vscode.window.showQuickPick(frameworks, {
                placeHolder: 'Select target framework',
                title: 'Switch Target Framework'
            });

            if (selectedFramework && frameworks.includes(selectedFramework)) {
                await configManager.updateConfig({ targetFramework: selectedFramework as 'express' | 'nextjs' | 'fastapi' | 'nestjs' | 'generic' });
                vscode.window.showInformationMessage(`Framework switched to ${selectedFramework}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to switch framework: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const manageProfilesCommand = vscode.commands.registerCommand('devomni.manageProfiles', async () => {
        try {
            const profiles = await configManager.getAvailableProfiles();
            const items = profiles.map(p => ({
                label: p.displayName,
                description: p.description,
                detail: `Database: ${p.database} | Profile: ${p.name}`
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'View available connection profiles',
                title: 'Connection Profile Manager'
            });

            if (selected) {
                vscode.window.showInformationMessage(`Selected: ${selected.label}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to manage profiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const testConnectionCommand = vscode.commands.registerCommand('devomni.testConnection', async () => {
        try {
            const isValid = await configManager.testConnection();
            
            if (isValid) {
                vscode.window.showInformationMessage('✅ Database connection successful!');
            } else {
                vscode.window.showWarningMessage('❌ Database connection failed. Check your configuration.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to test connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Context management commands
    const listContextsCommand = vscode.commands.registerCommand('devomni.listContexts', async () => {
        try {
            const result = await mcpClient.callTool('list_contexts', {});
            const response = JSON.parse(result.content[0].text);
            const contexts = response.contexts || response; // Handle both formats
            
            if (!contexts || contexts.length === 0) {
                vscode.window.showInformationMessage('No workflow contexts found. Create some in Claude Desktop first!');
                return;
            }

            const items = contexts.map((ctx: any) => ({
                label: ctx.name || ctx.contextName,
                description: `${ctx.intentAnalysis?.database || 'Unknown'} | ${ctx.intentAnalysis?.framework || 'Generic'}`,
                detail: ctx.intentAnalysis?.originalRequest || 'No description'
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Available workflow contexts'
            });

            if (selected) {
                vscode.window.showInformationMessage(`Selected context: ${(selected as any).label}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to list contexts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const searchContextsCommand = vscode.commands.registerCommand('devomni.searchContexts', async () => {
        try {
            const keyword = await vscode.window.showInputBox({
                prompt: 'Enter keyword to search for',
                placeHolder: 'e.g., user management, ecommerce, auth'
            });

            if (!keyword) return;

            const result = await mcpClient.callTool('search_contexts', {
                keywords: [keyword]
            });
            const response = JSON.parse(result.content[0].text);
            const contexts = response.contexts || response; // Handle both formats
            
            if (!contexts || contexts.length === 0) {
                vscode.window.showInformationMessage(`No contexts found matching "${keyword}"`);
                return;
            }

            const items = contexts.map((ctx: any) => ({
                label: ctx.name || ctx.contextName,
                description: `${ctx.intentAnalysis?.database || 'Unknown'} | ${ctx.intentAnalysis?.framework || 'Generic'}`,
                detail: ctx.intentAnalysis?.originalRequest || 'No description'
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Found ${contexts.length} context(s) matching "${keyword}"`
            });

            if (selected) {
                vscode.window.showInformationMessage(`Selected context: ${(selected as any).label}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search contexts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const getContextCommand = vscode.commands.registerCommand('devomni.getContext', async () => {
        try {
            const contextName = await vscode.window.showInputBox({
                prompt: 'Enter context name to retrieve',
                placeHolder: 'e.g., user_management_context'
            });

            if (!contextName) return;

            const result = await mcpClient.callTool('get_context', {
                context_name: contextName
            });
            const context = JSON.parse(result.content[0].text);
            
            // Show context details in a new document
            const doc = await vscode.workspace.openTextDocument({
                content: JSON.stringify(context, null, 2),
                language: 'json'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get context: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const createContextCommand = vscode.commands.registerCommand('devomni.createContext', async () => {
        try {
            const contextName = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new context',
                placeHolder: 'e.g., my_project_api_context'
            });

            if (!contextName) return;

            const userRequest = await vscode.window.showInputBox({
                prompt: 'Describe what you want to generate',
                placeHolder: 'e.g., user management APIs with authentication'
            });

            if (!userRequest) return;

            // Analyze intent first
            const intentResult = await mcpClient.callTool('analyze_intent', {
                user_request: userRequest,
                database: 'postgres', // Default, user can change
                framework: 'nextjs'   // Default, user can change
            });
            const intentAnalysis = JSON.parse(intentResult.content[0].text);

            // Create the context
            const result = await mcpClient.callTool('create_workflow_context', {
                context_name: contextName,
                intent_analysis: intentAnalysis,
                expires_in_minutes: 60
            });

            vscode.window.showInformationMessage(`Created workflow context: ${contextName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create context: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // MCP Setup Command
    const setupMCPCommand = vscode.commands.registerCommand('devomni.setupMCP', async () => {
        try {
            await setupMCPHandler();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to setup MCP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Enhanced Profile Management Commands
    const listProfilesCommand = vscode.commands.registerCommand('devomni.listProfiles', async () => {
        try {
            const result = await mcpClient.callTool('list_profiles', {});
            const response = JSON.parse(result.content[0].text);
            
            if (!response.profiles || response.profiles.length === 0) {
                vscode.window.showInformationMessage('No database profiles found. Create one using the "Create Profile" command!');
                return;
            }

            interface ProfileItem extends vscode.QuickPickItem {
                profileData: any;
            }

            const items: ProfileItem[] = response.profiles.map((profile: any) => ({
                label: `$(${profile.isActive ? 'check' : 'circle-outline'}) ${profile.name}`,
                description: `${profile.databases.join(', ')} • ${profile.source}`,
                detail: profile.isActive ? 'Currently Active' : 'Available',
                profileData: profile
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Database Connection Profiles',
                title: 'DevOmni - Profile Manager'
            });

            if (selected && !selected.profileData.isActive) {
                const switch_choice = await vscode.window.showInformationMessage(
                    `Switch to profile "${selected.profileData.name}"?`,
                    'Switch', 'Cancel'
                );

                if (switch_choice === 'Switch') {
                    await mcpClient.callTool('switch_profile', { profile_name: selected.profileData.name });
                    vscode.window.showInformationMessage(`✅ Switched to profile: ${selected.profileData.name}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to list profiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const switchProfileCommand = vscode.commands.registerCommand('devomni.switchProfile', async () => {
        try {
            const result = await mcpClient.callTool('list_profiles', {});
            const response = JSON.parse(result.content[0].text);
            
            if (!response.profiles || response.profiles.length === 0) {
                vscode.window.showInformationMessage('No profiles available to switch to.');
                return;
            }

            interface SwitchProfileItem extends vscode.QuickPickItem {
                profileName: string;
            }

            const items: SwitchProfileItem[] = response.profiles
                .filter((profile: any) => !profile.isActive)
                .map((profile: any) => ({
                    label: `$(database) ${profile.name}`,
                    description: profile.databases.join(', '),
                    detail: `Source: ${profile.source}`,
                    profileName: profile.name
                }));

            if (items.length === 0) {
                vscode.window.showInformationMessage('All available profiles are already active.');
                return;
            }

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select profile to switch to',
                title: 'DevOmni - Switch Profile'
            });

            if (selected) {
                await mcpClient.callTool('switch_profile', { profile_name: selected.profileName });
                vscode.window.showInformationMessage(`✅ Switched to profile: ${selected.profileName}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to switch profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const createProfileCommand = vscode.commands.registerCommand('devomni.createProfile', async () => {
        try {
            const profileName = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new profile',
                placeHolder: 'e.g., dev, staging, prod, client-a',
                validateInput: (value) => {
                    if (!value?.trim()) return 'Profile name cannot be empty';
                    if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Profile name can only contain letters, numbers, dashes, and underscores';
                    return undefined;
                }
            });

            if (!profileName) return;

            const databases: any = {};

            // PostgreSQL
            const postgres = await vscode.window.showInputBox({
                prompt: 'PostgreSQL connection string (optional)',
                placeHolder: 'postgresql://username:password@host:port/database'
            });
            if (postgres?.trim()) databases.postgres = postgres.trim();

            // MySQL
            const mysql = await vscode.window.showInputBox({
                prompt: 'MySQL connection string (optional)',
                placeHolder: 'mysql://username:password@host:port/database'
            });
            if (mysql?.trim()) databases.mysql = mysql.trim();

            // MongoDB
            const mongo = await vscode.window.showInputBox({
                prompt: 'MongoDB connection URI (optional)',
                placeHolder: 'mongodb://username:password@host:port/database'
            });
            if (mongo?.trim()) databases.mongo = mongo.trim();

            // Make databases optional - empty config is allowed
            const config = {
                postgres: databases.postgres || null,
                mysql: databases.mysql || null,
                mongo: databases.mongo || null
            };

            await mcpClient.callTool('create_profile', {
                profileName: profileName,
                config: config
            });

            const dbCount = Object.values(databases).filter(Boolean).length;
            const message = dbCount > 0 
                ? `✅ Created profile: ${profileName} with ${dbCount} database connection(s)`
                : `✅ Created empty profile: ${profileName} (you can add database connections later)`;
            
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const deleteProfileCommand = vscode.commands.registerCommand('devomni.deleteProfile', async () => {
        try {
            const result = await mcpClient.callTool('list_profiles', {});
            const response = JSON.parse(result.content[0].text);
            
            if (!response.profiles || response.profiles.length === 0) {
                vscode.window.showInformationMessage('No profiles available to delete.');
                return;
            }

            interface DeleteProfileItem extends vscode.QuickPickItem {
                profileName: string;
            }

            const items: DeleteProfileItem[] = response.profiles
                .filter((profile: any) => profile.name !== 'default' && profile.source === 'project')
                .map((profile: any) => ({
                    label: `$(trash) ${profile.name}`,
                    description: profile.databases.join(', '),
                    detail: profile.isActive ? 'Currently Active' : 'Available',
                    profileName: profile.name
                }));

            if (items.length === 0) {
                vscode.window.showInformationMessage('No project profiles available for deletion. Only project-specific profiles can be deleted.');
                return;
            }

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select profile to delete',
                title: 'DevOmni - Delete Profile'
            });

            if (selected) {
                const confirmation = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete profile "${selected.profileName}"? This action cannot be undone.`,
                    { modal: true },
                    'Delete',
                    'Cancel'
                );

                if (confirmation === 'Delete') {
                    await mcpClient.callTool('delete_profile', { profile_name: selected.profileName });
                    vscode.window.showInformationMessage(`✅ Deleted profile: ${selected.profileName}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const showActiveProfileCommand = vscode.commands.registerCommand('devomni.showActiveProfile', async () => {
        try {
            const result = await mcpClient.callTool('get_active_profile', {});
            const response = JSON.parse(result.content[0].text);

            const message = `🔗 Active Profile: ${response.activeProfile}\n\nDatabases:\n${Object.entries(response.activeConfig || {})
                .map(([db, conn]) => `• ${db.toUpperCase()}: ${conn}`)
                .join('\n')}`;

            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show active profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Add to subscriptions
    context.subscriptions.push(
        generateAPIsCommand,
        refreshSchemaCommand,
        showSchemaCommand,
        generateCRUDCommand,
        generateTypesCommand,
        setupProjectCommand,
        switchDatabaseCommand,
        switchFrameworkCommand,
        manageProfilesCommand,
        testConnectionCommand,
        listContextsCommand,
        searchContextsCommand,
        getContextCommand,
        createContextCommand,
        setupMCPCommand,
        listProfilesCommand,
        switchProfileCommand,
        createProfileCommand,
        deleteProfileCommand,
        showActiveProfileCommand
    );

    // Auto-refresh schema on activation if enabled
    const config = vscode.workspace.getConfiguration('devomni');
    if (config.get('autoRefreshSchema')) {
        refreshSchemaHandler(mcpClient, schemaCache).catch(error => {
            console.warn('Failed to auto-refresh schema:', error);
        });
    }

    // Set up file watcher for schema changes
    const schemaWatcher = vscode.workspace.createFileSystemWatcher('**/.devomni/schema.json');
    schemaWatcher.onDidChange(() => {
        schemaCache.invalidateCache();
        vscode.window.showInformationMessage('DevOmni schema cache refreshed');
    });

    context.subscriptions.push(schemaWatcher);
}

async function generateAPIsHandler(
    mcpClient: McpClient, 
    schemaCache: SchemaCache, 
    codeGenerator: CodeGenerator
) {
    const config = vscode.workspace.getConfiguration('devomni');
    const database = config.get('database') as string;
    const targetFramework = config.get('targetFramework') as string;

    // Show progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Generating APIs...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: "Fetching database schema..." });
        
        // Get schema (from cache or MCP server)
        let schema = schemaCache.getSchema(database);
        if (!schema) {
            schema = await mcpClient.exportSchemaForCodegen(database, targetFramework);
            schemaCache.setSchema(database, schema);
        }
        
        progress.report({ increment: 50, message: "Generating API code..." });
        
        // Generate APIs
        const generatedCode = await codeGenerator.generateAPIs(schema, targetFramework);
        
        progress.report({ increment: 80, message: "Creating files..." });
        
        // Create files in workspace
        await createGeneratedFiles(generatedCode);
        
        progress.report({ increment: 100, message: "Complete!" });
    });

    vscode.window.showInformationMessage('APIs generated successfully!');
}

async function refreshSchemaHandler(mcpClient: McpClient, schemaCache: SchemaCache) {
    const config = vscode.workspace.getConfiguration('devomni');
    const database = config.get('database') as string;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Refreshing schema...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: "Connecting to DevOmni MCP server..." });
        
        // Test connection
        const tablesResult = await mcpClient.listTables(database);
        
        progress.report({ increment: 30, message: `Found ${tablesResult.tables.length} tables. Fetching detailed schema...` });
        
        // Get full schema
        const schema = await mcpClient.getFullSchema(database);
        
        progress.report({ increment: 80, message: "Caching schema..." });
        
        // Cache schema
        schemaCache.setSchema(database, schema);
        await schemaCache.saveToFile(database, schema);
        
        progress.report({ increment: 100, message: "Complete!" });
    });

    vscode.window.showInformationMessage(`Schema refreshed for ${database}`);
}

async function showSchemaHandler(schemaCache: SchemaCache) {
    const config = vscode.workspace.getConfiguration('devomni');
    const database = config.get('database') as string;
    
    const schema = schemaCache.getSchema(database);
    if (!schema) {
        const refresh = await vscode.window.showInformationMessage(
            'Schema not cached. Would you like to refresh it?',
            'Refresh',
            'Cancel'
        );
        
        if (refresh === 'Refresh') {
            await vscode.commands.executeCommand('devomni.refreshSchema');
        }
        return;
    }

    // Create and show schema in new document
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(schema, null, 2),
        language: 'json'
    });
    
    await vscode.window.showTextDocument(doc);
}

async function generateCRUDHandler(
    mcpClient: McpClient, 
    schemaCache: SchemaCache, 
    codeGenerator: CodeGenerator
) {
    const config = vscode.workspace.getConfiguration('devomni');
    const database = config.get('database') as string;
    const targetFramework = config.get('targetFramework') as string;

    // Get schema
    let schema = schemaCache.getSchema(database);
    if (!schema) {
        schema = await mcpClient.getFullSchema(database);
        schemaCache.setSchema(database, schema);
    }

    // Let user select table
    const tables = Object.keys(schema.tables || {});
    if (tables.length === 0) {
        vscode.window.showErrorMessage('No tables found in schema');
        return;
    }

    const selectedTable = await vscode.window.showQuickPick(tables, {
        placeHolder: 'Select a table to generate CRUD APIs for'
    });

    if (!selectedTable) {
        return;
    }

    // Generate CRUD for selected table
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating CRUD APIs for ${selectedTable}...`,
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: "Generating CRUD operations..." });
        
        const crudCode = await codeGenerator.generateCRUD(
            selectedTable, 
            schema.tables[selectedTable], 
            targetFramework
        );
        
        progress.report({ increment: 80, message: "Creating files..." });
        
        await createGeneratedFiles(crudCode);
        
        progress.report({ increment: 100, message: "Complete!" });
    });

    vscode.window.showInformationMessage(`CRUD APIs generated for ${selectedTable}!`);
}

async function generateTypesHandler(
    mcpClient: McpClient, 
    schemaCache: SchemaCache, 
    codeGenerator: CodeGenerator
) {
    const config = vscode.workspace.getConfiguration('devomni');
    const database = config.get('database') as string;

    // Get schema
    let schema = schemaCache.getSchema(database);
    if (!schema) {
        schema = await mcpClient.getFullSchema(database);
        schemaCache.setSchema(database, schema);
    }

    // Generate TypeScript types
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Generating TypeScript types...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: "Analyzing schema..." });
        
        const typesCode = await codeGenerator.generateTypes(schema);
        
        progress.report({ increment: 80, message: "Creating types file..." });
        
        // Use safe file creation with overwrite protection
        await createGeneratedFiles({ 'types/database.ts': typesCode });
        
        progress.report({ increment: 100, message: "Complete!" });
    });

    vscode.window.showInformationMessage('TypeScript types generated!');
}

async function setupMCPHandler() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace/project folder first');
        return;
    }

    try {
        // Create .vscode directory if it doesn't exist
        const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
        await vscode.workspace.fs.createDirectory(vscodeDir);

        // Create MCP configuration
        const mcpConfig = {
            "servers": {
                "devomni-copilot": {
                    "type": "stdio",
                    "command": "node",
                    "args": [
                        "C:\\Users\\Varshil\\Desktop\\MyWebApps\\devomni-lite\\dist\\mcp-server-copilot.js"
                    ]
                }
            }
        };

        // Write mcp.json file
        const mcpConfigPath = vscode.Uri.joinPath(vscodeDir, 'mcp.json');
        await vscode.workspace.fs.writeFile(
            mcpConfigPath, 
            Buffer.from(JSON.stringify(mcpConfig, null, 2))
        );

        // Show success message with instructions
        const message = [
            '✅ DevOmni MCP configuration created!',
            '',
            '📁 Created: .vscode/mcp.json',
            '',
            '🔄 Please restart VS Code to activate MCP integration.',
            '',
            '💡 GitHub Copilot can now access DevOmni tools:'
        ].join('\n');

        const choice = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Restart VS Code',
            'View Config File',
            'OK'
        );

        if (choice === 'Restart VS Code') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        } else if (choice === 'View Config File') {
            const doc = await vscode.workspace.openTextDocument(mcpConfigPath);
            await vscode.window.showTextDocument(doc);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup MCP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function createGeneratedFiles(generatedCode: { [filename: string]: string }) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder open');
    }

    // Safety: Generate files into a dedicated directory
    const config = vscode.workspace.getConfiguration('devomni');
    const outputDir = config.get<string>('outputDirectory') || 'generated';
    
    let firstFile: vscode.Uri | null = null;
    const existingFiles: string[] = [];
    const filesToCreate: Array<{ path: vscode.Uri, content: string, relativePath: string }> = [];

    // Check for existing files first
    for (const [filename, content] of Object.entries(generatedCode)) {
        const safeFilename = `${outputDir}/${filename}`;
        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, safeFilename);
        
        try {
            await vscode.workspace.fs.stat(filePath);
            existingFiles.push(safeFilename);
        } catch {
            // File doesn't exist, safe to create
        }
        
        filesToCreate.push({
            path: filePath,
            content,
            relativePath: safeFilename
        });
    }

    // If files exist, prompt user for confirmation
    if (existingFiles.length > 0) {
        const choice = await vscode.window.showWarningMessage(
            `${existingFiles.length} file(s) already exist and will be overwritten:\n${existingFiles.join('\n')}`,
            { modal: true },
            'Overwrite All',
            'Cancel'
        );

        if (choice !== 'Overwrite All') {
            vscode.window.showInformationMessage('Code generation cancelled to prevent file overwrites.');
            return;
        }
    }

    // Create all files
    for (const fileInfo of filesToCreate) {
        // Create directory if it doesn't exist
        const directory = vscode.Uri.joinPath(fileInfo.path, '..');
        await vscode.workspace.fs.createDirectory(directory);
        
        // Write file safely
        await vscode.workspace.fs.writeFile(fileInfo.path, Buffer.from(fileInfo.content));
        
        if (!firstFile) {
            firstFile = fileInfo.path;
        }
    }

    // Show success message with output location
    vscode.window.showInformationMessage(
        `Generated ${filesToCreate.length} file(s) in /${outputDir}/ directory`
    );

    // Open the first generated file
    if (firstFile) {
        const doc = await vscode.workspace.openTextDocument(firstFile);
        await vscode.window.showTextDocument(doc);
    }
}

export function deactivate() {
    console.log('DevOmni Code Generator extension is now deactivated');
}