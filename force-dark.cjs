const fs = require('fs');
const file = 'src/components/AdminDataImport.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-[\w/\[\]#-]+(?:\s+)?(?:dark:)?(bg-[\w/\[\]#-]+)/g, '$1');
content = content.replace(/text-[\w/\[\]#-]+\s+(?:dark:)?(text-[\w/\[\]#-]+)/g, '$1');
content = content.replace(/border-[\w/\[\]#-]+\s+(?:dark:)?(border-[\w/\[\]#-]+)/g, '$1');
content = content.replace(/hover:bg-[\w/\[\]#-]+(?:\s+)?(?:dark:)?(hover:bg-[\w/\[\]#-]+)/g, '$1');
content = content.replace(/hover:text-[\w/\[\]#-]+\s+(?:dark:)?(hover:text-[\w/\[\]#-]+)/g, '$1');

fs.writeFileSync(file, content);
console.log('Done replacing light classes with dark variants.');
