#!/usr/bin/env node
/**
 * Validates that all OpenAPI YAML specs in docs/api/specs/ contain
 * the required top-level fields: openapi, info, paths.
 *
 * Usage: node scripts/validate-openapi.js
 */
const fs = require('fs');
const path = require('path');

const specsDir = path.join(__dirname, '../docs/api/specs');
const specs = fs.readdirSync(specsDir).filter((f) => f.endsWith('.yaml'));

let errors = 0;

for (const spec of specs) {
  const filePath = path.join(specsDir, spec);
  const content = fs.readFileSync(filePath, 'utf8');
  const required = ['openapi', 'info', 'paths'];
  let specErrors = 0;

  for (const field of required) {
    if (!content.includes(field + ':')) {
      console.error(`FAIL: ${spec} missing required field '${field}:'`);
      errors++;
      specErrors++;
    }
  }

  // Check openapi version is 3.0.x
  if (!content.includes('openapi: "3.0.') && !content.includes("openapi: '3.0.")) {
    console.error(`FAIL: ${spec} does not declare openapi 3.0.x version`);
    errors++;
    specErrors++;
  }

  // Check info has title and version
  if (!content.includes('title:')) {
    console.error(`FAIL: ${spec} info section missing 'title:'`);
    errors++;
    specErrors++;
  }
  if (!content.includes('version:')) {
    console.error(`FAIL: ${spec} info section missing 'version:'`);
    errors++;
    specErrors++;
  }

  if (specErrors === 0) {
    console.log(`OK: ${spec}`);
  }
}

console.log(`\nValidated ${specs.length} specs, ${errors} errors`);
process.exit(errors > 0 ? 1 : 0);
