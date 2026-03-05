#!/usr/bin/env node
// Check that all .yaml files in infrastructure/k8s/ are non-empty and contain expected keywords
const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) files.push(full);
  }
  return files;
}

const k8sDir = path.join(__dirname, '../infrastructure/k8s');
const yamlFiles = walk(k8sDir);
let errors = 0;

for (const file of yamlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('apiVersion')) {
    console.error(`FAIL: ${file} missing apiVersion`);
    errors++;
  } else {
    console.log(`OK: ${file}`);
  }
}

console.log(`\nValidated ${yamlFiles.length} files, ${errors} errors`);
process.exit(errors > 0 ? 1 : 0);
