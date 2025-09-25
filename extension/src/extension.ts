import * as vscode from 'vscode';
import { McpClient } from './mcpClient'; 
import { SchemaCache } from './schemaCache'; 
import { CodeGenerator } from './codeGenerator';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevOmni Code Generator extension is now active!');

    const mcpClient = new McpClient();
    const schemaCache = new SchemaCache(context);
    const codeGenerator = new CodeGenerator();

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

    // Add to subscriptions
    context.subscriptions.push(
        generateAPIsCommand,
        refreshSchemaCommand,
        showSchemaCommand,
        generateCRUDCommand,
        generateTypesCommand
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
        
        // Create types.ts file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const typesPath = vscode.Uri.joinPath(workspaceFolder.uri, 'types', 'database.ts');
        await vscode.workspace.fs.writeFile(typesPath, Buffer.from(typesCode));
        
        // Open the generated file
        const doc = await vscode.workspace.openTextDocument(typesPath);
        await vscode.window.showTextDocument(doc);
        
        progress.report({ increment: 100, message: "Complete!" });
    });

    vscode.window.showInformationMessage('TypeScript types generated!');
}

async function createGeneratedFiles(generatedCode: { [filename: string]: string }) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder open');
    }

    let firstFile: vscode.Uri | null = null;

    for (const [filename, content] of Object.entries(generatedCode)) {
        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, filename);
        
        // Create directory if it doesn't exist
        const directory = vscode.Uri.joinPath(filePath, '..');
        await vscode.workspace.fs.createDirectory(directory);
        
        // Write file
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(content));
        
        if (!firstFile) {
            firstFile = filePath;
        }
    }

    // Open the first generated file
    if (firstFile) {
        const doc = await vscode.workspace.openTextDocument(firstFile);
        await vscode.window.showTextDocument(doc);
    }
}

export function deactivate() {
    console.log('DevOmni Code Generator extension is now deactivated');
}