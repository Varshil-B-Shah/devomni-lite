import { DatabaseSchema, TableSchema, ColumnSchema, FieldSchema } from './mcpClient';

export class CodeGenerator {
    
    async generateAPIs(schema: DatabaseSchema, targetFramework: string): Promise<{ [filename: string]: string }> {
        const files: { [filename: string]: string } = {};
        
        switch (targetFramework) {
            case 'nextjs':
                return this.generateNextJSAPIs(schema);
            case 'express':
                return this.generateExpressAPIs(schema);
            case 'nestjs':
                return this.generateNestJSAPIs(schema);
            case 'fastapi':
                return this.generateFastAPIAPIs(schema);
            default:
                return this.generateGenericAPIs(schema);
        }
    }

    async generateCRUD(tableName: string, tableSchema: TableSchema, targetFramework: string): Promise<{ [filename: string]: string }> {
        switch (targetFramework) {
            case 'nextjs':
                return this.generateNextJSCRUD(tableName, tableSchema);
            case 'express':
                return this.generateExpressCRUD(tableName, tableSchema);
            default:
                return this.generateGenericCRUD(tableName, tableSchema);
        }
    }

    async generateTypes(schema: DatabaseSchema): Promise<string> {
        return this.generateTypesSync(schema);
    }

    private generateTypesSync(schema: DatabaseSchema): string {
        let typeDefinitions = `// Generated TypeScript types from database schema\n`;
        typeDefinitions += `// Generated at: ${new Date().toISOString()}\n`;
        typeDefinitions += `// Database: ${schema.database}\n\n`;

        for (const [tableName, tableSchema] of Object.entries(schema.tables)) {
            typeDefinitions += this.generateTableTypes(tableName, tableSchema);
            typeDefinitions += '\n';
        }

        return typeDefinitions;
    }

    private generateNextJSAPIs(schema: DatabaseSchema): { [filename: string]: string } {
        const files: { [filename: string]: string } = {};
        
        // Generate API routes for each table
        for (const [tableName, tableSchema] of Object.entries(schema.tables)) {
            const apiRoute = this.generateNextJSAPIRoute(tableName, tableSchema, schema.database);
            files[`app/api/${tableName}/route.ts`] = apiRoute;
            
            // Generate dynamic route for individual records
            const dynamicRoute = this.generateNextJSDynamicRoute(tableName, tableSchema, schema.database);
            files[`app/api/${tableName}/[id]/route.ts`] = dynamicRoute;
        }

        // Generate types file
        files['types/database.ts'] = this.generateTypesSync(schema);
        
        // Generate database utility
        files['lib/database.ts'] = this.generateDatabaseUtil(schema.database);

        return files;
    }

    private generateNextJSAPIRoute(tableName: string, tableSchema: TableSchema, database: string): string {
        const typeName = this.capitalize(tableName);
        const tableType = tableSchema.type || 'table';
        
        let code = `import { NextRequest, NextResponse } from 'next/server';\n`;
        code += `import { ${typeName} } from '@/types/database';\n`;
        code += `import { getDatabase } from '@/lib/database';\n\n`;
        
        // GET handler
        code += `export async function GET(request: NextRequest) {\n`;
        code += `  try {\n`;
        code += `    const { searchParams } = new URL(request.url);\n`;
        code += `    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);\n`;
        code += `    const offset = parseInt(searchParams.get('offset') || '0');\n\n`;
        
        if (database === 'mongo') {
            code += `    const db = await getDatabase();\n`;
            code += `    const collection = db.collection('${tableName}');\n`;
            code += `    const results = await collection.find({})\n`;
            code += `      .limit(limit)\n`;
            code += `      .skip(offset)\n`;
            code += `      .toArray();\n\n`;
            code += `    const total = await collection.countDocuments();\n\n`;
        } else {
            code += `    const db = await getDatabase();\n`;
            code += `    const query = \`SELECT * FROM ${tableName} LIMIT $1 OFFSET $2\`;\n`;
            code += `    const result = await db.query(query, [limit, offset]);\n`;
            code += `    const countResult = await db.query(\`SELECT COUNT(*) FROM ${tableName}\`);\n\n`;
            code += `    const results = result.rows;\n`;
            code += `    const total = parseInt(countResult.rows[0].count);\n\n`;
        }
        
        code += `    return NextResponse.json({\n`;
        code += `      data: results,\n`;
        code += `      pagination: {\n`;
        code += `        total,\n`;
        code += `        limit,\n`;
        code += `        offset,\n`;
        code += `        pages: Math.ceil(total / limit)\n`;
        code += `      }\n`;
        code += `    });\n`;
        code += `  } catch (error) {\n`;
        code += `    console.error('Error fetching ${tableName}:', error);\n`;
        code += `    return NextResponse.json(\n`;
        code += `      { error: 'Failed to fetch ${tableName}' },\n`;
        code += `      { status: 500 }\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n\n`;

        // POST handler
        code += `export async function POST(request: NextRequest) {\n`;
        code += `  try {\n`;
        code += `    const body = await request.json() as Partial<${typeName}>;\n\n`;
        code += `    // TODO: Add validation here\n\n`;
        
        if (database === 'mongo') {
            code += `    const db = await getDatabase();\n`;
            code += `    const collection = db.collection('${tableName}');\n`;
            code += `    const result = await collection.insertOne(body);\n\n`;
            code += `    const created = await collection.findOne({ _id: result.insertedId });\n\n`;
        } else {
            const columns = this.getColumnNames(tableSchema);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const columnList = columns.join(', ');
            
            code += `    const db = await getDatabase();\n`;
            code += `    const query = \`\n`;
            code += `      INSERT INTO ${tableName} (${columnList})\n`;
            code += `      VALUES (${placeholders})\n`;
            code += `      RETURNING *\n`;
            code += `    \`;\n`;
            code += `    const values = [${columns.map(col => `body.${col}`).join(', ')}];\n`;
            code += `    const result = await db.query(query, values);\n\n`;
            code += `    const created = result.rows[0];\n\n`;
        }
        
        code += `    return NextResponse.json(created, { status: 201 });\n`;
        code += `  } catch (error) {\n`;
        code += `    console.error('Error creating ${tableName}:', error);\n`;
        code += `    return NextResponse.json(\n`;
        code += `      { error: 'Failed to create ${tableName}' },\n`;
        code += `      { status: 500 }\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    private generateNextJSDynamicRoute(tableName: string, tableSchema: TableSchema, database: string): string {
        const typeName = this.capitalize(tableName);
        const idColumn = this.getIdColumn(tableSchema);
        
        let code = `import { NextRequest, NextResponse } from 'next/server';\n`;
        code += `import { ${typeName} } from '@/types/database';\n`;
        code += `import { getDatabase } from '@/lib/database';\n\n`;
        
        // GET handler
        code += `export async function GET(\n`;
        code += `  request: NextRequest,\n`;
        code += `  { params }: { params: { id: string } }\n`;
        code += `) {\n`;
        code += `  try {\n`;
        code += `    const { id } = params;\n\n`;
        
        if (database === 'mongo') {
            code += `    const db = await getDatabase();\n`;
            code += `    const collection = db.collection('${tableName}');\n`;
            code += `    const result = await collection.findOne({ ${idColumn}: id });\n\n`;
            code += `    if (!result) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
        } else {
            code += `    const db = await getDatabase();\n`;
            code += `    const query = \`SELECT * FROM ${tableName} WHERE ${idColumn} = $1\`;\n`;
            code += `    const result = await db.query(query, [id]);\n\n`;
            code += `    if (result.rows.length === 0) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
            code += `    const record = result.rows[0];\n\n`;
        }
        
        code += `    return NextResponse.json(${database === 'mongo' ? 'result' : 'record'});\n`;
        code += `  } catch (error) {\n`;
        code += `    console.error('Error fetching ${tableName}:', error);\n`;
        code += `    return NextResponse.json(\n`;
        code += `      { error: 'Failed to fetch ${tableName}' },\n`;
        code += `      { status: 500 }\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n\n`;

        // PUT handler
        code += `export async function PUT(\n`;
        code += `  request: NextRequest,\n`;
        code += `  { params }: { params: { id: string } }\n`;
        code += `) {\n`;
        code += `  try {\n`;
        code += `    const { id } = params;\n`;
        code += `    const body = await request.json() as Partial<${typeName}>;\n\n`;
        code += `    // TODO: Add validation here\n\n`;
        
        if (database === 'mongo') {
            code += `    const db = await getDatabase();\n`;
            code += `    const collection = db.collection('${tableName}');\n`;
            code += `    const result = await collection.findOneAndUpdate(\n`;
            code += `      { ${idColumn}: id },\n`;
            code += `      { $set: body },\n`;
            code += `      { returnDocument: 'after' }\n`;
            code += `    );\n\n`;
            code += `    if (!result.value) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
            code += `    return NextResponse.json(result.value);\n`;
        } else {
            const columns = this.getColumnNames(tableSchema).filter(col => col !== idColumn);
            const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
            
            code += `    const db = await getDatabase();\n`;
            code += `    const query = \`\n`;
            code += `      UPDATE ${tableName}\n`;
            code += `      SET ${setClause}\n`;
            code += `      WHERE ${idColumn} = $1\n`;
            code += `      RETURNING *\n`;
            code += `    \`;\n`;
            code += `    const values = [id, ${columns.map(col => `body.${col}`).join(', ')}];\n`;
            code += `    const result = await db.query(query, values);\n\n`;
            code += `    if (result.rows.length === 0) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
            code += `    return NextResponse.json(result.rows[0]);\n`;
        }
        
        code += `  } catch (error) {\n`;
        code += `    console.error('Error updating ${tableName}:', error);\n`;
        code += `    return NextResponse.json(\n`;
        code += `      { error: 'Failed to update ${tableName}' },\n`;
        code += `      { status: 500 }\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n\n`;

        // DELETE handler
        code += `export async function DELETE(\n`;
        code += `  request: NextRequest,\n`;
        code += `  { params }: { params: { id: string } }\n`;
        code += `) {\n`;
        code += `  try {\n`;
        code += `    const { id } = params;\n\n`;
        
        if (database === 'mongo') {
            code += `    const db = await getDatabase();\n`;
            code += `    const collection = db.collection('${tableName}');\n`;
            code += `    const result = await collection.deleteOne({ ${idColumn}: id });\n\n`;
            code += `    if (result.deletedCount === 0) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
        } else {
            code += `    const db = await getDatabase();\n`;
            code += `    const query = \`DELETE FROM ${tableName} WHERE ${idColumn} = $1\`;\n`;
            code += `    const result = await db.query(query, [id]);\n\n`;
            code += `    if (result.rowCount === 0) {\n`;
            code += `      return NextResponse.json(\n`;
            code += `        { error: '${typeName} not found' },\n`;
            code += `        { status: 404 }\n`;
            code += `      );\n`;
            code += `    }\n\n`;
        }
        
        code += `    return NextResponse.json({ message: '${typeName} deleted successfully' });\n`;
        code += `  } catch (error) {\n`;
        code += `    console.error('Error deleting ${tableName}:', error);\n`;
        code += `    return NextResponse.json(\n`;
        code += `      { error: 'Failed to delete ${tableName}' },\n`;
        code += `      { status: 500 }\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    private generateExpressAPIs(schema: DatabaseSchema): { [filename: string]: string } {
        const files: { [filename: string]: string } = {};
        
        // Generate main routes file
        files['routes/index.ts'] = this.generateExpressMainRoutes(schema);
        
        // Generate individual route files
        for (const [tableName] of Object.entries(schema.tables)) {
            files[`routes/${tableName}.ts`] = this.generateExpressTableRoutes(tableName, schema.tables[tableName], schema.database);
        }
        
        // Generate types
        files['types/database.ts'] = this.generateTypesSync(schema);
        
        return files;
    }

    private generateGenericAPIs(schema: DatabaseSchema): { [filename: string]: string } {
        const files: { [filename: string]: string } = {};
        
        files['types.ts'] = this.generateTypesSync(schema);
        files['README.md'] = this.generateAPIDocumentation(schema);
        
        return files;
    }

    // Helper methods
    private generateTableTypes(tableName: string, tableSchema: TableSchema): string {
        const typeName = this.capitalize(tableName);
        let typeDefinition = `export interface ${typeName} {\n`;
        
        if (tableSchema.columns) {
            // SQL table
            for (const [columnName, columnSchema] of Object.entries(tableSchema.columns)) {
                const tsType = this.sqlTypeToTypeScript(columnSchema.type);
                const optional = columnSchema.nullable ? '?' : '';
                typeDefinition += `  ${columnName}${optional}: ${tsType};\n`;
            }
        } else if (tableSchema.fields) {
            // MongoDB collection
            for (const [fieldName, fieldSchema] of Object.entries(tableSchema.fields)) {
                const tsType = this.mongoFieldToTypeScript(fieldSchema);
                const optional = fieldSchema.nullable ? '?' : '';
                typeDefinition += `  ${fieldName}${optional}: ${tsType};\n`;
            }
        }
        
        typeDefinition += '}\n\n';
        
        // Generate create and update types
        typeDefinition += `export interface Create${typeName} extends Omit<${typeName}, 'id' | 'created_at' | 'updated_at'> {}\n\n`;
        typeDefinition += `export interface Update${typeName} extends Partial<Create${typeName}> {}\n\n`;
        
        return typeDefinition;
    }

    private sqlTypeToTypeScript(sqlType: string): string {
        const type = sqlType.toLowerCase();
        
        if (type.includes('int') || type.includes('serial') || type.includes('numeric') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
            return 'number';
        }
        if (type.includes('bool')) {
            return 'boolean';
        }
        if (type.includes('json')) {
            return 'any';
        }
        if (type.includes('date') || type.includes('time')) {
            return 'Date | string';
        }
        
        return 'string';
    }

    private mongoFieldToTypeScript(fieldSchema: FieldSchema): string {
        const types = fieldSchema.types;
        const tsTypes = types.map(type => {
            switch (type) {
                case 'number': return 'number';
                case 'boolean': return 'boolean';
                case 'object': return 'any';
                default: return 'string';
            }
        });
        
        return tsTypes.length > 1 ? tsTypes.join(' | ') : tsTypes[0] || 'any';
    }

    private generateDatabaseUtil(database: string): string {
        switch (database) {
            case 'postgres':
                return `import { Pool } from 'pg';\n\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n\nexport async function getDatabase() {\n  return pool;\n}\n`;
            case 'mysql':
                return `import mysql from 'mysql2/promise';\n\nconst pool = mysql.createPool({\n  host: process.env.DB_HOST,\n  user: process.env.DB_USER,\n  password: process.env.DB_PASSWORD,\n  database: process.env.DB_NAME,\n});\n\nexport async function getDatabase() {\n  return pool;\n}\n`;
            case 'mongo':
                return `import { MongoClient } from 'mongodb';\n\nconst client = new MongoClient(process.env.MONGODB_URI!);\n\nexport async function getDatabase() {\n  await client.connect();\n  return client.db(process.env.MONGODB_DATABASE);\n}\n`;
            default:
                return '// Database utility - configure for your database\n';
        }
    }

    private getColumnNames(tableSchema: TableSchema): string[] {
        if (tableSchema.columns) {
            return Object.keys(tableSchema.columns);
        }
        if (tableSchema.fields) {
            return Object.keys(tableSchema.fields);
        }
        return [];
    }

    private getIdColumn(tableSchema: TableSchema): string {
        if (tableSchema.columns) {
            for (const [columnName, columnSchema] of Object.entries(tableSchema.columns)) {
                if (columnSchema.key === 'PRI' || columnName.toLowerCase() === 'id') {
                    return columnName;
                }
            }
        }
        return '_id'; // Default for MongoDB
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Stub implementations for other frameworks
    private generateNestJSAPIs(schema: DatabaseSchema): { [filename: string]: string } {
        return { 'README.md': '// NestJS API generation - To be implemented' };
    }

    private generateFastAPIAPIs(schema: DatabaseSchema): { [filename: string]: string } {
        return { 'README.md': '// FastAPI generation - To be implemented' };
    }

    private generateNextJSCRUD(tableName: string, tableSchema: TableSchema): { [filename: string]: string } {
        return { 'README.md': '// NextJS CRUD generation - To be implemented' };
    }

    private generateExpressCRUD(tableName: string, tableSchema: TableSchema): { [filename: string]: string } {
        return { 'README.md': '// Express CRUD generation - To be implemented' };
    }

    private generateGenericCRUD(tableName: string, tableSchema: TableSchema): { [filename: string]: string } {
        return { 'README.md': '// Generic CRUD generation - To be implemented' };
    }

    private generateExpressMainRoutes(schema: DatabaseSchema): string {
        return '// Express main routes - To be implemented';
    }

    private generateExpressTableRoutes(tableName: string, tableSchema: TableSchema, database: string): string {
        return '// Express table routes - To be implemented';
    }

    private generateAPIDocumentation(schema: DatabaseSchema): string {
        return '# Generated API Documentation\\n\\n// To be implemented';
    }
}