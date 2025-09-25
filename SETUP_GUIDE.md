# DevOmni Lite: Complete Setup & Usage Guide

## 🎉 **Status: READY TO USE**

Your DevOmni Lite ecosystem is now fully operational with both MCP server and VS Code extension!

## 🏗️ **Architecture Overview**

```
Claude Desktop ←→ DevOmni MCP Server ←→ Database
                           ↕
VS Code Extension ←→ HTTP Bridge Server ←→ GitHub Copilot
```

## 🚀 **Quick Start**

### **Step 1: Configure Database**
Create `.env` file in project root:
```env
PG_CONNECTION_STRING=postgresql://user:password@host:5432/database
# OR
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_db
# OR
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=your_db
```

### **Step 2: Start Both Servers**

**Terminal 1 - MCP Server (for Claude Desktop):**
```bash
cd devomni-lite
npm start
```

**Terminal 2 - HTTP Server (for VS Code Extension):**
```bash
cd devomni-lite
node dist/server.js
```

### **Step 3: Install VS Code Extension**
```bash
cd extension
code --install-extension devomni-codegen-0.1.0.vsix
```

### **Step 4: Configure VS Code**
Add to your VS Code `settings.json`:
```json
{
  "devomni.mcpServerUrl": "http://localhost:3000",
  "devomni.database": "postgres", // or "mysql" or "mongodb"
  "devomni.targetFramework": "nextjs" // or "express", "nestjs"
}
```

## 🎯 **Usage Examples**

### **For Database Exploration (Claude Desktop)**
```
"Show me all tables in the database"
"Query the users table for recent signups"
"Compare user counts between dev and prod databases"
"Generate a schema diagram for the orders table"
```

### **For Code Generation (VS Code + Copilot)**
1. **Refresh Schema**: Cmd/Ctrl+Shift+P → "DevOmni: Refresh Database Schema"
2. **Ask Copilot**: "Generate CRUD APIs for the users table"
3. **Watch Magic**: Complete API routes, types, and utilities generated!

## 🛠️ **Available Commands**

### **VS Code Extension Commands**
- `DevOmni: Generate APIs from Database Schema` - Generate APIs for entire database
- `DevOmni: Refresh Database Schema` - Sync latest schema from database  
- `DevOmni: Show Database Schema` - View cached schema in VS Code
- `DevOmni: Generate CRUD APIs for Table` - Generate specific table APIs
- `DevOmni: Generate Types from Schema` - Generate TypeScript interfaces

### **MCP Tools (Claude Desktop)**
- `unified_query` - Query any database with security validation
- `compare_databases` - Compare data between databases
- `get_database_schema` - Extract complete schema with relationships
- `list_database_tables` - List all tables/collections
- `export_schema_for_codegen` - Schema optimized for AI code generation

## 📦 **Generated Code Examples**

### **Next.js API Route** (`/api/users/[id].ts`)
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserById, updateUser, deleteUser } from '@/lib/database/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  switch (req.method) {
    case 'GET':
      return handleGet(id as string, res);
    // ... complete CRUD implementation
  }
}
```

### **TypeScript Types** (`types/database.ts`)
```typescript
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
}
```

### **Database Utils** (`lib/database/users.ts`)
```typescript
import { pool } from './connection';

export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}
```

## 🔒 **Security Features**
- ✅ **Input Validation**: Comprehensive Zod validation
- ✅ **Injection Protection**: SQL and NoSQL injection prevention  
- ✅ **Parameterized Queries**: Safe database interactions
- ✅ **Security Logging**: Complete audit trail
- ✅ **104 Security Tests**: Comprehensive test coverage

## 🧪 **Test Results**
```
Test Suites: 4 passed, 4 total
Tests:       104 passed, 104 total
Time:        0.993 s
```

## 🎯 **What You Can Do Now**

1. **Ask Claude Desktop**: "Analyze my user engagement metrics from the database"
2. **Ask GitHub Copilot**: "Create a REST API for the products table with validation"
3. **Combine Both**: Use Claude for analysis, Copilot for code generation
4. **Scale Up**: Add more database connections, customize code templates

## 📈 **Next Steps**

1. **Test End-to-End**: Try the complete workflow with your database
2. **Customize Templates**: Modify `codeGenerator.ts` for your preferred patterns
3. **Add More Frameworks**: Extend support for FastAPI, Django, etc.
4. **Deploy**: Use generated APIs in your production applications

## 🆘 **Troubleshooting**

### **MCP Server Won't Connect**
- Check database connection string in `.env`
- Verify server is running on correct port
- Check Claude Desktop MCP configuration

### **VS Code Extension Not Working**
- Ensure HTTP server is running on port 3000
- Check VS Code settings configuration
- Refresh schema manually if automatic sync fails

### **Code Generation Issues**
- Verify schema cache is populated (`DevOmni: Show Database Schema`)
- Check GitHub Copilot is active and authenticated
- Try refreshing schema and regenerating

---

**🎊 Congratulations!** You now have a complete AI-powered development ecosystem that can analyze databases AND generate production-ready code automatically!