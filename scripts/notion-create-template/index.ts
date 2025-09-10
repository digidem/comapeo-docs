#!/usr/bin/env bun
import { createContentTemplate } from './createTemplate.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

// Export the main function for use in other modules
export { createContentTemplate };

// CLI execution
if (isDirectExec) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: Please provide a title for the content template');
    console.log('Usage: bun scripts/notion-create-template "Your Content Title"');
    process.exit(1);
  }

  const title = args[0];

  createContentTemplate(title)
    .then(() => {
      console.log('🎉 Content template creation completed!');
    })
    .catch((error) => {
      console.error(`💥 Error: ${error.message}`);
      process.exit(1);
    });
}
