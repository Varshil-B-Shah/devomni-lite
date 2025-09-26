#!/usr/bin/env node

/**
 * DevOmni MCP Server - GitHub Copilot Edition
 * 
 * CONTEXT ACCESS ONLY for GitHub Copilot:
 * - Read workflow contexts created by Claude Desktop
 * - Search and list contexts
 * - NO database schema access
 * - NO intent analysis
 * 
 * Role: Code Generation Agent (Consumes Contexts)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import shared storage only
import { SharedContextStorage } from './sharedContextStorage.js';

// DevOmni MCP Server - GitHub Copilot Edition
// Role: Code Generation Agent (Context Consumer)

// Use shared context storage for cross-agent communication
const sharedStorage = new SharedContextStorage();

// Create the MCP server
const server = new Server(
  {
    name: "devomni-copilot",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List tools handler - GITHUB COPILOT GETS LIMITED ACCESS
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // CONTEXT ACCESS TOOLS ONLY (No schema, no analysis)
      {
        name: "list_contexts",
        description:
          "List all available workflow contexts created by Claude Desktop. Shows context names, creation times, and expiration status for code generation planning.",
        inputSchema: {
          type: "object",
          properties: {
            include_expired: {
              type: "boolean",
              description: "Include expired contexts in the list",
              default: false
            }
          },
          additionalProperties: false
        },
      },
      {
        name: "search_contexts",
        description:
          "Search workflow contexts by keywords, database type, or framework. Find relevant contexts when multiple exist to guide code generation.",
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords to search for in context names and intent analysis"
            },
            database: {
              type: "string",
              enum: ["postgres", "mysql", "mongo"],
              description: "Filter by database type"
            },
            framework: {
              type: "string",
              enum: ["nextjs", "express", "nestjs", "fastapi", "generic"],
              description: "Filter by target framework"
            }
          },
          additionalProperties: false
        },
      },
      {
        name: "get_context",
        description:
          "Retrieve a specific workflow context by name. Contains analyzed intent, preview data, and all information needed for accurate API generation. Use this to understand what Claude Desktop has planned before generating code.",
        inputSchema: {
          type: "object",
          properties: {
            context_name: {
              type: "string",
              description: "Name of the workflow context to retrieve"
            }
          },
          required: ["context_name"],
          additionalProperties: false
        },
      },
    ],
  };
});

// Tool execution handler - CONTEXT TOOLS ONLY
server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case "list_contexts": {
          const { include_expired = false } = args as any;
          const contexts = await sharedStorage.listContexts(include_expired);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ contexts }, null, 2)
            }],
          };
        }

        case "search_contexts": {
          const { keywords, database, framework } = args as any;
          const contexts = await sharedStorage.searchContexts(keywords, database, framework);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ contexts }, null, 2)
            }],
          };
        }

        case "get_context": {
          const { context_name } = args as any;
          const context = await sharedStorage.getContext(context_name);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(context, null, 2)
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}. GitHub Copilot edition only supports context access tools.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            tool: name,
            timestamp: new Date().toISOString(),
            note: "GitHub Copilot edition - Context access only. Use Claude Desktop for schema analysis and intent processing."
          }, null, 2)
        }],
        isError: true,
      };
    }
  }
);

// Run the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub Copilot MCP server running on stdio");
}

runServer().catch((error) => {
  console.error("Failed to run server:", error);
  process.exit(1);
});