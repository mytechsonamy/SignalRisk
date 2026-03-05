#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '../.github/workflows');
const workflows = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml'));

let errors = 0;
for (const workflow of workflows) {
  const content = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
  const required = ['name:', 'on:', 'jobs:'];
  for (const field of required) {
    if (!content.includes(field)) {
      console.error(`FAIL: ${workflow} missing '${field}'`);
      errors++;
    }
  }
  console.log(`OK: ${workflow} (${content.split('\n').length} lines)`);
}
console.log(`\nValidated ${workflows.length} workflows, ${errors} errors`);
process.exit(errors > 0 ? 1 : 0);
