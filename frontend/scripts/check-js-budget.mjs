#!/usr/bin/env node

import fs from "fs";
import path from "path";

const budgetKb = Number(process.env.JS_BUDGET_KB || "250");
const budgetBytes = Math.floor(budgetKb * 1024);
const chunksDir = path.resolve(".next/static/chunks");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!fs.existsSync(chunksDir)) {
  console.error("Missing .next/static/chunks. Run `npm run build` first.");
  process.exit(1);
}

const jsFiles = walk(chunksDir);
const oversized = jsFiles
  .map((filePath) => ({
    filePath,
    size: fs.statSync(filePath).size,
  }))
  .filter((entry) => entry.size > budgetBytes)
  .sort((a, b) => b.size - a.size);

if (!oversized.length) {
  console.log(`PASS: all JS chunks are within ${budgetKb} KB budget.`);
  process.exit(0);
}

console.error(`FAIL: ${oversized.length} JS chunk(s) exceed ${budgetKb} KB.`);
for (const item of oversized.slice(0, 10)) {
  const kb = (item.size / 1024).toFixed(1);
  const rel = path.relative(process.cwd(), item.filePath);
  console.error(` - ${rel}: ${kb} KB`);
}

process.exit(1);
