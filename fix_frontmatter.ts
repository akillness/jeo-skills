import * as fs from 'fs';
import * as path from 'path';

const SKILLS_DIR = process.env.SKILLS_DIR ? path.resolve(process.env.SKILLS_DIR) : path.resolve('.agent-skills');

function parseFrontmatter(content: string): [string | null, string] {
  if (!content.startsWith('---')) {
    return [null, content];
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) {
    return [null, content];
  }
  const fmStr = content.substring(3, end).trim();
  let body = content.substring(end + 4);
  if (body.startsWith('\n')) {
    body = body.substring(1);
  }
  return [fmStr, body];
}

function unquote(val: string): string {
  return val.trim().replace(/^["']|["']$/g, '');
}

function yamlListToDelimited(val: string, sep: string): string {
  const v = val.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.substring(1, v.length - 1).trim();
    if (!inner) return '';
    const items = inner.split(',').map(x => unquote(x.trim()));
    return items.filter(Boolean).join(sep);
  }
  return unquote(v);
}

function extractMappingBlock(fmStr: string, key: string): [Record<string, string>, string | null, string] {
  const pattern = new RegExp(`^${key}:[ \	]*\\n((?:[ \	]+[^\\n]*\\n?)+)`, 'm');
  const m = pattern.exec(fmStr + '\n');
  if (!m) {
    return [{}, null, fmStr];
  }
  const block = m[0].trimEnd();
  const sub: Record<string, string> = {};
  const lines = m[1].split('\n');
  for (const line of lines) {
    const sm = /^\s+(\w[\w-]*)\s*:\s*(.*)/.exec(line);
    if (sm) {
      sub[sm[1]] = unquote(sm[2].trim());
    }
  }
  const remaining = (fmStr + '\n').replace(pattern, '').trim();
  return [sub, block, remaining];
}

function truncateDesc(desc: string, maxLen: number = 1024): string {
  if (desc.length <= maxLen) {
    return desc;
  }
  const cut = desc.substring(0, maxLen - 3);
  const sp = cut.lastIndexOf(' ');
  if (sp > maxLen * 0.8) {
    return cut.substring(0, sp) + '...';
  }
  return cut + '...';
}

function quoteYaml(v: string): string {
  const special = new Set(':#{}&*?|<>=!%@`\'"\\');
  let hasSpecial = false;
  for (const c of v) {
    if (special.has(c)) {
      hasSpecial = true;
      break;
    }
  }
  if (hasSpecial || v.startsWith('-') || !v) {
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return v;
}

function fixSkill(skillDir: string): { status: string; changes: string[] } {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    return { status: 'no_file', changes: [] };
  }

  const content = fs.readFileSync(skillFile, 'utf-8');
  const [fmStr, body] = parseFrontmatter(content);
  if (fmStr === null) {
    return { status: 'no_frontmatter', changes: [] };
  }

  const dirName = path.basename(skillDir);
  const changes: string[] = [];

  // Special pre-extraction: auto-apply block
  let autoApplyVal: string | null = null;
  let [sub, block, remainingFmStr] = extractMappingBlock(fmStr, 'auto-apply');
  if (block !== null) {
    let models = sub['models'] || '';
    if (!models) {
      const modelsMatch = /models:\n((?:\s+-[^\n]+\n?)+)/.exec(block);
      if (modelsMatch) {
        const items: string[] = [];
        const lines = modelsMatch[1].split('\n');
        for (const line of lines) {
          const m = /-\s+(.+)/.exec(line);
          if (m) items.push(m[1].trim());
        }
        models = items.join(', ');
      }
    }
    const trigger = sub['trigger'] || '';
    const reps = sub['default_repetitions'] || '';
    const ratio = sub['max_context_ratio'] || '';
    const parts: string[] = [];
    if (models) parts.push(`models: ${models}`);
    if (trigger) parts.push(`trigger: ${trigger}`);
    if (reps) parts.push(`default_repetitions: ${reps}`);
    if (ratio) parts.push(`max_context_ratio: ${ratio}`);
    autoApplyVal = parts.length > 0 ? parts.join('; ') : block;
  }

  // Special pre-extraction: metadata block
  let [existingMetadata, _, finalFmStr] = extractMappingBlock(remainingFmStr, 'metadata');

  // Parse remaining top-level keys
  const top: Record<string, string> = {};
  const lines = finalFmStr.split('\n');
  for (const line of lines) {
    const m = /^(\w[\w-]*)\s*:\s*(.*)/.exec(line);
    if (m) {
      top[m[1]] = m[2].trim();
    }
  }

  const newFm: Record<string, any> = {};
  const newMeta = { ...existingMetadata };

  // name
  let rawName = unquote(top['name'] || dirName);
  if (rawName !== dirName) {
    changes.push(`name: ${JSON.stringify(rawName)} → ${JSON.stringify(dirName)}`);
    rawName = dirName;
  }
  newFm['name'] = rawName;

  // description
  let rawDesc = unquote(top['description'] || '');
  if (rawDesc.startsWith('"') && rawDesc.endsWith('"')) {
    rawDesc = rawDesc.substring(1, rawDesc.length - 1);
  }
  const trunc = truncateDesc(rawDesc);
  if (trunc !== rawDesc) {
    changes.push(`description truncated (${rawDesc.length}→${trunc.length})`);
  }
  newFm['description'] = trunc;

  // license
  if ('license' in top) {
    newFm['license'] = unquote(top['license']);
  }

  // compatibility
  if ('compatibility' in top) {
    let v = unquote(top['compatibility']);
    if (v.length > 500) {
      v = v.substring(0, 497) + '...';
      changes.push('compatibility truncated');
    }
    newFm['compatibility'] = v;
  }

  // allowed-tools
  if ('allowed-tools' in top) {
    const space = yamlListToDelimited(top['allowed-tools'], ' ');
    if (space) {
      const orig = top['allowed-tools'];
      if (orig !== space) {
        changes.push('allowed-tools: array → space-delimited');
      }
      newFm['allowed-tools'] = space;
    } else {
      changes.push('allowed-tools: empty → removed');
    }
  }

  // Non-standard fields → metadata
  const moves: Record<string, string> = {
    tags: 'tags',
    platforms: 'platforms',
    keyword: 'keyword',
    version: 'version',
    source: 'source',
    verified: 'verified',
    'verified-with': 'verified-with',
    author: 'author',
  };

  for (const [field, metaKey] of Object.entries(moves)) {
    if (field in top) {
      const raw = top[field];
      let val = '';
      if (field === 'tags' || field === 'platforms') {
        val = yamlListToDelimited(raw, ', ');
      } else {
        val = unquote(raw);
      }
      if (val) {
        newMeta[metaKey] = val;
        changes.push(`${field} → metadata.${metaKey}`);
      }
    } 
  }

  if (autoApplyVal) {
    newMeta['auto-apply'] = autoApplyVal;
    changes.push('auto-apply → metadata.auto-apply');
  }

  if (Object.keys(newMeta).length > 0) {
    newFm['metadata'] = newMeta;
  }

  // Render new frontmatter
  const outLines = ['---'];
  const order = ['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata'];
  for (const field of order) {
    if (!(field in newFm)) {
      continue;
    }
    const val = newFm[field];
    if (field === 'metadata') {
      outLines.push('metadata:');
      for (const [mk, mv] of Object.entries(val)) {
        outLines.push(`  ${mk}: ${quoteYaml(String(mv))}`);
      }
    } else if (field === 'description') {
      outLines.push(`description: ${quoteYaml(String(val))}`);
    } else {
      outLines.push(`${field}: ${quoteYaml(String(val))}`);
    }
  }
  outLines.push('---');

  const newContent = outLines.join('\n') + '\n\n' + body;

  if (newContent !== content) {
    fs.writeFileSync(skillFile, newContent, 'utf-8');
    return { status: 'fixed', changes };
  }
  return { status: 'ok', changes: [] };
}

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`ERROR: ${SKILLS_DIR} not found`);
    process.exit(1);
  }

  const skillDirs = fs.readdirSync(SKILLS_DIR)
    .map(name => path.join(SKILLS_DIR, name))
    .filter(p => fs.statSync(p).isDirectory() && !path.basename(p).startsWith('.') && !path.basename(p).startsWith('__'))
    .sort();

  console.log(`Processing ${skillDirs.length} skills in ${SKILLS_DIR}\n`);

  const counts = { fixed: 0, ok: 0, no_file: 0, no_frontmatter: 0, error: 0 };
  const errors: [string, string][] = [];

  for (const skillDir of skillDirs) {
    const name = path.basename(skillDir);
    try {
      const r = fixSkill(skillDir);
      counts[r.status as keyof typeof counts]++;
      if (r.status === 'fixed') {
        console.log(`✅ FIXED  ${name}`);
        for (const c of r.changes) {
          console.log(`         - ${c}`);
        } 
      } else if (r.status === 'ok') {
        // console.log(`✓  OK     ${name}`);
      } else if (r.status === 'no_file') {
        console.log(`⚠  NOFILE ${name}`);
      } else {
        console.log(`⚠  NOFM   ${name}`);
      }
    } catch (e: any) {
      counts.error++;
      errors.push([name, e.message]);
      console.error(`❌ ERROR  ${name}: ${e.message}`);
      console.error(e.stack);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`  Fixed:          ${counts.fixed}`);
  console.log(`  Already OK:     ${counts.ok}`);
  console.log(`  No SKILL.md:    ${counts.no_file}`);
  console.log(`  No frontmatter: ${counts.no_frontmatter}`);
  console.log(`  Errors:         ${counts.error}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const [name, err] of errors) {
      console.log(`  ${name}: ${err}`);
    }
    process.exit(1);
  }
}

main();
