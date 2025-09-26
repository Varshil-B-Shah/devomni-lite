// Demo: How a different Copilot instance would list contexts
// This simulates what happens when you ask me "list all contexts" from another VS Code window

const { McpServerTestClient } = require('./tests/mcpTestClient');

async function listContextsAsDifferentCopilot() {
    console.log('🤖 GitHub Copilot (Different Instance): User asked me to list all contexts');
    console.log('📡 Connecting to DevOmni MCP Server...\n');

    const client = new McpServerTestClient();
    
    try {
        // Start MCP server connection
        await client.startServer();
        console.log('✅ Connected to MCP server');
        
        // List available tools (just to show what's available)
        const tools = await client.listTools();
        console.log(`🔧 Found ${tools.length} MCP tools available`);
        
        // This is what I would do - call list_contexts directly
        console.log('📋 Calling list_contexts tool...\n');
        const result = await client.callTool('list_contexts', {});
        
        console.log('🎯 RESULT: Available Workflow Contexts');
        console.log('=' * 50);
        
        if (result.contexts && result.contexts.length > 0) {
            result.contexts.forEach((ctx, i) => {
                console.log(`${i + 1}. ${ctx.contextName}`);
                console.log(`   📊 Database: ${ctx.intentAnalysis?.database || 'N/A'}`);
                console.log(`   🔧 Framework: ${ctx.intentAnalysis?.framework || 'N/A'}`);
                console.log(`   📝 Request: ${ctx.intentAnalysis?.originalRequest || 'N/A'}`);
                console.log(`   🕒 Created: ${ctx.createdAt || 'Unknown'}`);
                console.log(`   ⏰ Expires: ${ctx.expiresAt || 'Never'}`);
                console.log('');
            });
            
            console.log(`💡 Found ${result.contexts.length} workflow context(s) created by Claude Desktop`);
            console.log('🚀 I can now use get_context to retrieve any of these for API generation!');
        } else {
            console.log('📭 No workflow contexts found.');
            console.log('💡 Tip: Create some contexts in Claude Desktop first by analyzing database schemas');
        }
        
    } catch (error) {
        console.error('❌ Error listing contexts:', error.message);
        console.log('💡 This would happen if the MCP server is not running or no contexts exist yet');
    } finally {
        await client.cleanup();
    }
}

// Run the demo
listContextsAsDifferentCopilot().catch(console.error);