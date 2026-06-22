import * as fs from 'fs';
import * as path from 'path';

const content = fs.readFileSync('.agent-skills/agentation/SKILL.md', 'utf-8');
console.log('Original content:');
console.log(content.substring(0, 300));
