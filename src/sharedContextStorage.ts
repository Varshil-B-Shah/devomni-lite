import fs from 'fs';
import path from 'path';

/**
 * Shared context storage using file system
 * Both MCP server and HTTP server can read/write to the same storage
 */
export class SharedContextStorage {
    private contextFile: string;

    constructor() {
        // Store contexts in a shared file
        this.contextFile = path.join(process.cwd(), '.devomni', 'workflow-contexts.json');
        this.ensureContextFile();
    }

    private ensureContextFile() {
        const dir = path.dirname(this.contextFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.contextFile)) {
            fs.writeFileSync(this.contextFile, JSON.stringify({ contexts: {} }, null, 2));
        }
    }

    private readContexts(): { contexts: Record<string, any> } {
        try {
            const data = fs.readFileSync(this.contextFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.warn('Error reading contexts file, creating new one:', error);
            const defaultData = { contexts: {} };
            fs.writeFileSync(this.contextFile, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
    }

    private writeContexts(data: { contexts: Record<string, any> }) {
        fs.writeFileSync(this.contextFile, JSON.stringify(data, null, 2));
    }

    createContext(contextName: string, intentAnalysis: any, previewData?: any, expiresInMinutes: number = 60): any {
        const data = this.readContexts();
        
        const context = {
            id: contextName,
            name: contextName,
            contextName,
            created: new Date().toISOString(),
            expires: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
            intentAnalysis,
            previewData,
            status: 'ready',
            instructions: {
                forClaude: `Use this context to understand the user's intent for ${contextName}. The context contains analyzed requirements and preview data.`,
                forCopilot: `Generate code based on this context: ${contextName}. Use the intent analysis and preview data to create appropriate API implementations.`
            }
        };

        data.contexts[contextName] = context;
        this.writeContexts(data);

        return context;
    }

    listContexts(includeExpired: boolean = false): any[] {
        const data = this.readContexts();
        const now = new Date();
        
        const contexts = Object.entries(data.contexts).map(([name, context]) => ({
            name,
            contextName: name,
            ...context,
            isExpired: new Date((context as any).expiresAt || (context as any).expires) < now
        }));

        if (!includeExpired) {
            return contexts.filter(c => !c.isExpired);
        }

        return contexts;
    }

    getContext(contextName: string): any {
        const data = this.readContexts();
        const context = data.contexts[contextName];
        
        if (!context) {
            throw new Error(`Context '${contextName}' not found`);
        }

        // Check if expired using both field names for backward compatibility
        const expiresAt = context.expiresAt || context.expires;
        if (expiresAt && new Date(expiresAt) < new Date()) {
            delete data.contexts[contextName];
            this.writeContexts(data);
            throw new Error(`Context '${contextName}' has expired`);
        }

        return {
            name: contextName,
            contextName,
            ...context,
            isExpired: false
        };
    }

    searchContexts(keywords?: string[], database?: string, framework?: string): any[] {
        const contexts = this.listContexts(false); // Only active contexts
        
        return contexts.filter(context => {
            // Filter by database
            if (database && context.intentAnalysis?.database !== database) {
                return false;
            }

            // Filter by framework
            if (framework && context.intentAnalysis?.framework !== framework) {
                return false;
            }

            // Filter by keywords
            if (keywords && keywords.length > 0) {
                const searchText = `${context.contextName} ${context.intentAnalysis?.originalRequest || ''}`.toLowerCase();
                return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
            }

            return true;
        });
    }

    deleteContext(contextName: string): boolean {
        const data = this.readContexts();
        if (data.contexts[contextName]) {
            delete data.contexts[contextName];
            this.writeContexts(data);
            return true;
        }
        return false;
    }

    // Cleanup expired contexts
    cleanupExpiredContexts(): number {
        const data = this.readContexts();
        const now = new Date();
        let deletedCount = 0;

        Object.keys(data.contexts).forEach(contextName => {
            const context = data.contexts[contextName];
            if (new Date(context.expiresAt) < now) {
                delete data.contexts[contextName];
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            this.writeContexts(data);
        }

        return deletedCount;
    }
}