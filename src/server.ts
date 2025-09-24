import express from "express";
import { PostgresAdapter } from "./postgresAdapter.js";

const app = express();
app.use(express.json());
const db = new PostgresAdapter(process.env.PG_CONNECTION_STRING!);

app.post("/query", async (req, res) => {
  const { sql, params } = req.body;
  try {
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (e: unknown) {
    if (e instanceof Error) {
      res.status(500).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Unknown error" });
    }
  }
});

app.get("/schema", async (req, res) => {
  const result = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  );
  res.json(result.rows);
});

app.get("/test-connection", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error) {
      res.status(500).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Unknown error" });
    }
  }
});

app.listen(3000, () => console.log("MCP server running on port 3000"));
