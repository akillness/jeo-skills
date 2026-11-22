import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root=import.meta.dirname;
const excluded=new Set(['art-science-lab','dist','early-slice','node_modules','public','scripts','shared']);
const pages=Object.fromEntries(readdirSync(root,{withFileTypes:true})
 .filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')&&!excluded.has(entry.name))
 .map(entry=>[entry.name,resolve(root,entry.name,'index.html')]));

export default defineConfig({
 base:'./',
 // With a hosted VITE_ASSET_BASE the studies never request /assets/, so the 169 MB of STL
 // under public/ must not be copied into the build (that is the whole point of hosting it).
 publicDir:process.env.VITE_ASSET_BASE?false:'public',
 build:{rollupOptions:{input:{index:resolve(root,'index.html'),...pages}}}
});
