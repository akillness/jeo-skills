// Reuse the installed, version-pinned scanner and its stored root policy.
// This program does not open the vector database or initialize an index.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, packageDir] = process.argv.slice(2);
const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
if (pkg.name !== '@zvec/zvec-grep' || pkg.version !== '0.2.2') throw new Error('unsupported scanner package');
const manifest = JSON.parse(await readFile(join(root, '.zvec-grep', 'manifest.json'), 'utf8'));
if (manifest.indexPolicy === 'disabled' || !manifest.id || !Array.isArray(manifest.rootPaths)) throw new Error('index not scannable');
const project = await realpath(root);
const inside = (path) => {
  const rel = relative(project, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
};
const roots = [];
for (const entry of manifest.rootPaths) {
  if (!entry || typeof entry.absolutePath !== 'string' || entry.follow === true) throw new Error('unsafe root policy');
  const path = await realpath(entry.absolutePath);
  if (!inside(path)) throw new Error('root outside workspace');
  roots.push({ ...entry, absolutePath: path, follow: false });
}
const { scanRootPaths } = await import(pathToFileURL(join(packageDir, 'dist/engine/pipeline/indexing/scanner/index.js')).href);
const { files } = await scanRootPaths(manifest.id, roots);
const state = {};
for (const file of files) {
  let path;
  try {
    path = await realpath(file.absolutePath);
    if (!inside(path)) throw new Error('file outside workspace');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const digest = createHash('sha256');
      for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk);
      state[path] = [file.sizeBytes, file.lastModifiedTime, digest.digest('hex')];
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    if (path && ['EACCES', 'EPERM', 'EISDIR', 'ELOOP', 'EMFILE'].includes(error.code)) {
      state[path] = ['err', error.code];
    } else throw error;
  }
}
process.stdout.write(JSON.stringify(state));
