import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3200;

const app = express();
app.use(express.static(path.join(__dirname, "docs")));

app.listen(PORT, () => {
  console.log(`\n🧮 soroban-master 起動: http://localhost:${PORT}\n`);
});
