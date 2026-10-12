import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installSafety_here = dirname(fileURLToPath(import.meta.url));
const installSafety_repo = resolve(installSafety_here, '..');
const installSafety_fixtures = [];
const installSafety_native = [
  'plugins/shared/jev-controller.mjs',
  'plugins/omp/index.mjs', 'plugins/omp/package.json', 'plugins/omp/shared/jev-controller.mjs',
  'plugins/pi/index.mjs', 'plugins/pi/package.json', 'plugins/pi/shared/jev-controller.mjs',
  'plugins/jeopi/index.mjs', 'plugins/jeopi/package.json', 'plugins/jeopi/shared/jev-controller.mjs',
  'plugins/claude/hooks/jev-hook.mjs', 'plugins/claude/hooks/hooks.json', 'plugins/claude/.claude-plugin/plugin.json',
  'plugins/claude/shared/jev-controller.mjs',
];
const installSafety_catalog = join(installSafety_repo, '.agent-skills', 'skills.json');

function installSafety_root(prefix = 'jev-install-test-') {
  const installSafety_rootDir = mkdtempSync(join(tmpdir(), prefix));
  installSafety_fixtures.push(installSafety_rootDir);
  const installSafety_home = join(installSafety_rootDir, 'home');
  const installSafety_source = join(installSafety_rootDir, 'source');
  mkdirSync(installSafety_home, { recursive: true });
  mkdirSync(installSafety_source, { recursive: true });
  return { installSafety_rootDir, installSafety_home, installSafety_source };
}
function installSafety_local({ installSafety_manifest = true } = {}) {
  const installSafety_fixture = installSafety_root();
  cpSync(installSafety_here, join(installSafety_fixture.installSafety_source, 'jev'), { recursive: true });
  if (installSafety_manifest) {
    mkdirSync(join(installSafety_fixture.installSafety_source, '.agent-skills'), { recursive: true });
    copyFileSync(installSafety_catalog, join(installSafety_fixture.installSafety_source, '.agent-skills', 'skills.json'));
  } else rmSync(join(installSafety_fixture.installSafety_source, '.agent-skills'), { recursive: true, force: true });
  return installSafety_fixture;
}
function installSafety_env(installSafety_home, installSafety_extra = {}) {
  const installSafety_envValue = { ...process.env, HOME: installSafety_home, TMPDIR: installSafety_home, XDG_CONFIG_HOME: join(installSafety_home, '.config'), XDG_CACHE_HOME: join(installSafety_home, '.cache') };
  for (const installSafety_key of Object.keys(installSafety_envValue)) if (installSafety_key.startsWith('JEV_') || installSafety_key.startsWith('JEO_SKILLS_')) delete installSafety_envValue[installSafety_key];
  return { ...installSafety_envValue, ...installSafety_extra };
}
function installSafety_run(installSafety_fixture, installSafety_args, installSafety_extra = {}) {
  const installSafety_environment = installSafety_env(installSafety_fixture.installSafety_home, installSafety_extra);
  if (installSafety_extra.installSafety_bin) installSafety_environment.PATH = `${installSafety_extra.installSafety_bin}:${process.env.PATH}`;
  delete installSafety_environment.installSafety_bin;
  return spawnSync('bash', [join(installSafety_fixture.installSafety_source, 'jev', 'jev-setup.sh'), ...installSafety_args], { cwd: installSafety_fixture.installSafety_source, env: installSafety_environment, encoding: 'utf8', timeout: 30_000 });
}
function installSafety_ok(installSafety_result) { assert.equal(installSafety_result.status, 0, `${installSafety_result.stdout}\n${installSafety_result.stderr}`); }
function installSafety_private(installSafety_path, installSafety_contents) { mkdirSync(dirname(installSafety_path), { recursive: true }); writeFileSync(installSafety_path, installSafety_contents, { mode: 0o600 }); chmodSync(installSafety_path, 0o600); }
function installSafety_profile(installSafety_home, installSafety_name) { const installSafety_dir = join(installSafety_home, '.agents', 'jev', 'profiles'); return { installSafety_dir, installSafety_base: join(installSafety_dir, `${installSafety_name}.env`), installSafety_api: join(installSafety_dir, `${installSafety_name}.api.env`) }; }
function installSafety_systemone(installSafety_name) { return ['--profile', installSafety_name, '--mode', 'systemone']; }
const installSafety_systemoneEnv = { JEV_SYSTEMONE_ENDPOINT: 'http://127.0.0.1:1/v1/systemone', JEV_SYSTEMONE_MODEL: 'fixture-systemone-model' };
function installSafety_seedExisting(installSafety_fixture, { installSafety_skip = [] } = {}) {
  const installSafety_installed = join(installSafety_fixture.installSafety_home, '.agents', 'jev');
  const installSafety_before = new Map();
  const installSafety_paths = ['jev-harness.mjs', 'jev_local_server.py', 'README.md', 'jev-control-plane.rule.md', 'jev-plugin.mjs', 'skills.json', ...installSafety_native];
  for (const installSafety_relative of installSafety_paths) {
    if (installSafety_skip.some(installSafety_prefix => installSafety_relative.startsWith(installSafety_prefix))) continue;
    const installSafety_destination = join(installSafety_installed, installSafety_relative);
    mkdirSync(dirname(installSafety_destination), { recursive: true });
    const installSafety_bytes = Buffer.from(`prior-${installSafety_relative}\n`);
    writeFileSync(installSafety_destination, installSafety_bytes);
    installSafety_before.set(installSafety_relative, installSafety_bytes);
  }
  const installSafety_profileData = installSafety_profile(installSafety_fixture.installSafety_home, 'sentinel');
  installSafety_private(installSafety_profileData.installSafety_base, 'JEV_ENABLED=true\nJEV_MODE=api\n');
  installSafety_private(installSafety_profileData.installSafety_api, 'JEV_API_KEY=sentinel-secret\n');
  installSafety_before.set('profiles/sentinel.env', readFileSync(installSafety_profileData.installSafety_base));
  installSafety_before.set('profiles/sentinel.api.env', readFileSync(installSafety_profileData.installSafety_api));
  return { installSafety_installed, installSafety_before };
}
function installSafety_assertExistingUnchanged({ installSafety_installed, installSafety_before }) {
  for (const [installSafety_relative, installSafety_bytes] of installSafety_before) assert.deepEqual(readFileSync(join(installSafety_installed, installSafety_relative)), installSafety_bytes, installSafety_relative);
}
function installSafety_seedStandaloneConfigOnly(installSafety_fixture) {
  const installSafety_installed = join(installSafety_fixture.installSafety_home, '.agents', 'jev');
  for (const installSafety_relative of ['jev-harness.mjs', 'jev_local_server.py', 'README.md', 'jev-control-plane.rule.md']) {
    const installSafety_destination = join(installSafety_installed, installSafety_relative);
    mkdirSync(dirname(installSafety_destination), { recursive: true });
    copyFileSync(join(installSafety_here, installSafety_relative), installSafety_destination);
  }
  mkdirSync(dirname(join(installSafety_installed, 'skills.json')), { recursive: true });
  copyFileSync(installSafety_catalog, join(installSafety_installed, 'skills.json'));
  return installSafety_installed;
}

function installSafety_rawCurl(installSafety_rootDir, { installSafety_missing = null } = {}) {
  const installSafety_payload = join(installSafety_rootDir, 'trusted-raw');
  const installSafety_bin = join(installSafety_rootDir, 'bin');
  const installSafety_log = join(installSafety_rootDir, 'curl.log');
  mkdirSync(installSafety_bin, { recursive: true });
  const installSafety_assets = ['jev-harness.mjs', 'jev_local_server.py', 'README.md', 'jev-control-plane.rule.md', 'jev-plugin.mjs', ...installSafety_native, '.agent-skills/skills.json'];
  for (const installSafety_relative of installSafety_assets) {
    if (installSafety_relative === installSafety_missing) continue;
    const installSafety_source = installSafety_relative === '.agent-skills/skills.json' ? installSafety_catalog : join(installSafety_here, installSafety_relative);
    const installSafety_destination = join(installSafety_payload, installSafety_relative);
    mkdirSync(dirname(installSafety_destination), { recursive: true });
    copyFileSync(installSafety_source, installSafety_destination);
  }
  const installSafety_curl = join(installSafety_bin, 'curl');
  writeFileSync(installSafety_curl, `#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');const payload=${JSON.stringify(installSafety_payload)};const log=${JSON.stringify(installSafety_log)};const args=process.argv.slice(2);const url=args.find(value=>/^https?:/.test(value));const output=args.indexOf('-o');const destination=output<0?null:args[output+1];if(!url||!destination)process.exit(2);const pathname=new URL(url).pathname;const marker=pathname.lastIndexOf('/jev/');const relative=marker<0?pathname.replace(/^\\/+/, ''):pathname.slice(marker+5);fs.appendFileSync(log,relative+'\\n');const source=path.join(payload,relative);if(!fs.existsSync(source)||!fs.statSync(source).isFile()){process.stderr.write('curl fixture missing asset: '+relative+'\\n');process.exit(22)}fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);\n`);
  chmodSync(installSafety_curl, 0o755);
  return { installSafety_bin, installSafety_log };
}
after(() => { for (const installSafety_fixture of installSafety_fixtures) rmSync(installSafety_fixture, { recursive: true, force: true }); });

test('destination nested symlink is rejected before outside or profile credential writes', () => {
  const installSafety_fixture = installSafety_local(); const installSafety_existing = installSafety_seedExisting(installSafety_fixture);
  const installSafety_jevHome = installSafety_existing.installSafety_installed;
  const installSafety_outside = join(installSafety_fixture.installSafety_rootDir, 'outside');
  mkdirSync(join(installSafety_jevHome, 'plugins', 'pi'), { recursive: true }); mkdirSync(installSafety_outside, { recursive: true });
  const installSafety_sentinel = join(installSafety_outside, 'sentinel'); writeFileSync(installSafety_sentinel, 'do not clobber\n'); rmSync(join(installSafety_jevHome, 'plugins', 'pi', 'index.mjs')); symlinkSync(installSafety_sentinel, join(installSafety_jevHome, 'plugins', 'pi', 'index.mjs'));
  installSafety_existing.installSafety_before.delete('plugins/pi/index.mjs');
  const installSafety_profileData = installSafety_profile(installSafety_fixture.installSafety_home, 'guarded'); installSafety_private(installSafety_profileData.installSafety_base, 'JEV_ENABLED=true\nJEV_MODE=api\n'); installSafety_private(installSafety_profileData.installSafety_api, 'JEV_API_KEY=old-secret\n');
  const installSafety_before = [readFileSync(installSafety_profileData.installSafety_base), readFileSync(installSafety_profileData.installSafety_api)];
  const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('guarded'), installSafety_systemoneEnv);
  assert.notEqual(installSafety_result.status, 0); assert.match(`${installSafety_result.stdout}\n${installSafety_result.stderr}`, /symlink/i); assert.equal(readFileSync(installSafety_sentinel, 'utf8'), 'do not clobber\n'); installSafety_assertExistingUnchanged(installSafety_existing); assert.deepEqual(readFileSync(installSafety_profileData.installSafety_base), installSafety_before[0]); assert.deepEqual(readFileSync(installSafety_profileData.installSafety_api), installSafety_before[1]);
});

test('source nested symlink is rejected without following outside content or changing profiles', () => {
  const installSafety_fixture = installSafety_local(); const installSafety_existing = installSafety_seedExisting(installSafety_fixture); const installSafety_outside = join(installSafety_fixture.installSafety_rootDir, 'outside'); mkdirSync(installSafety_outside, { recursive: true });
  const installSafety_sentinel = join(installSafety_outside, 'index.mjs'); writeFileSync(installSafety_sentinel, 'outside source\n'); const installSafety_link = join(installSafety_fixture.installSafety_source, 'jev', 'plugins', 'pi', 'index.mjs'); rmSync(installSafety_link); symlinkSync(installSafety_sentinel, installSafety_link);
  const installSafety_profileData = installSafety_profile(installSafety_fixture.installSafety_home, 'source-guard'); installSafety_private(installSafety_profileData.installSafety_base, 'JEV_ENABLED=false\nJEV_MODE=api\n'); installSafety_private(installSafety_profileData.installSafety_api, 'JEV_API_KEY=profile-secret\n'); const installSafety_before = readFileSync(installSafety_profileData.installSafety_api);
  const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('source-guard'), installSafety_systemoneEnv);
  assert.notEqual(installSafety_result.status, 0); assert.match(`${installSafety_result.stdout}\n${installSafety_result.stderr}`, /symlink/i); assert.equal(readFileSync(installSafety_sentinel, 'utf8'), 'outside source\n'); installSafety_assertExistingUnchanged(installSafety_existing); assert.deepEqual(readFileSync(installSafety_profileData.installSafety_api), installSafety_before);
});

test('non-regular native destination collision fails and preserves all prior host data', () => {
  const installSafety_fixture = installSafety_local(); const installSafety_existing = installSafety_seedExisting(installSafety_fixture, { installSafety_skip: ['plugins/pi/'] }); const installSafety_collision = join(installSafety_existing.installSafety_installed, 'plugins', 'pi'); mkdirSync(dirname(installSafety_collision), { recursive: true }); writeFileSync(installSafety_collision, 'host-owned\n');
  const installSafety_before = readFileSync(installSafety_collision); const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('collision'), installSafety_systemoneEnv);
  assert.notEqual(installSafety_result.status, 0); assert.deepEqual(readFileSync(installSafety_collision), installSafety_before); assert.equal(statSync(installSafety_collision).isFile(), true); installSafety_assertExistingUnchanged(installSafety_existing); assert.doesNotMatch(installSafety_result.stdout, /Setup complete/);
});


test('raw no-checkout setup installs trusted controller, package metadata, CLI, and private catalog snapshot', () => {
  const installSafety_fixture = installSafety_root('jev-raw-install-test-'); mkdirSync(join(installSafety_fixture.installSafety_source, 'jev'), { recursive: true }); copyFileSync(join(installSafety_here, 'jev-setup.sh'), join(installSafety_fixture.installSafety_source, 'jev', 'jev-setup.sh'));
  const installSafety_curl = installSafety_rawCurl(installSafety_fixture.installSafety_rootDir); const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('raw'), { ...installSafety_systemoneEnv, installSafety_bin: installSafety_curl.installSafety_bin, JEO_SKILLS_RAW_BASE: 'https://raw.fixture.test/jev' }); installSafety_ok(installSafety_result);
  const installSafety_installed = join(installSafety_fixture.installSafety_home, '.agents', 'jev'); assert.deepEqual(readFileSync(join(installSafety_installed, 'jev-harness.mjs')), readFileSync(join(installSafety_here, 'jev-harness.mjs'))); assert.deepEqual(readFileSync(join(installSafety_installed, 'skills.json')), readFileSync(installSafety_catalog));
  for (const installSafety_relative of installSafety_native) assert.deepEqual(readFileSync(join(installSafety_installed, installSafety_relative)), readFileSync(join(installSafety_here, installSafety_relative)), installSafety_relative);
  assert.equal(JSON.parse(readFileSync(join(installSafety_installed, 'plugins', 'pi', 'package.json'))).name, 'jev-pi-extension');
  const installSafety_route = spawnSync(process.execPath, [join(installSafety_installed, 'jev-harness.mjs'), '--profile', 'raw', 'route-skills', '--mock', 'native plugin installation'], { cwd: installSafety_fixture.installSafety_source, env: installSafety_env(installSafety_fixture.installSafety_home), encoding: 'utf8', timeout: 10_000 });
  assert.equal(installSafety_route.status, 0, `${installSafety_route.stdout}\n${installSafety_route.stderr}`); assert.match(installSafety_route.stdout, /"fullCatalogSkills"\s*:\s*[1-9]/); assert.ok(readFileSync(installSafety_curl.installSafety_log, 'utf8').includes('plugins/shared/jev-controller.mjs')); assert.ok(readFileSync(installSafety_curl.installSafety_log, 'utf8').includes('plugins/pi/package.json')); assert.ok(readFileSync(installSafety_curl.installSafety_log, 'utf8').includes('.agent-skills/skills.json')); assert.doesNotMatch(installSafety_result.stdout, /secret|API.?KEY/i);
});

test('unknown raw asset fails truthfully without partial native-success claim', () => {
  const installSafety_fixture = installSafety_root('jev-raw-missing-asset-'); mkdirSync(join(installSafety_fixture.installSafety_source, 'jev'), { recursive: true }); copyFileSync(join(installSafety_here, 'jev-setup.sh'), join(installSafety_fixture.installSafety_source, 'jev', 'jev-setup.sh'));
  const installSafety_missing = 'plugins/pi/package.json'; const installSafety_curl = installSafety_rawCurl(installSafety_fixture.installSafety_rootDir, { installSafety_missing }); const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('missing'), { ...installSafety_systemoneEnv, installSafety_bin: installSafety_curl.installSafety_bin, JEO_SKILLS_RAW_BASE: 'https://raw.fixture.test/jev' });
  assert.notEqual(installSafety_result.status, 0); assert.match(`${installSafety_result.stdout}\n${installSafety_result.stderr}`, /Cannot fetch plugins\/pi\/package\.json/); assert.doesNotMatch(installSafety_result.stdout, /Setup complete|native plugin installed/i); assert.equal(existsSync(join(installSafety_fixture.installSafety_home, '.agents', 'jev', installSafety_missing)), false);
});
test('late mandatory native fetch failure is atomic across prior core, native, catalog, and profile bytes', () => {
  const installSafety_fixture = installSafety_root('jev-raw-late-native-failure-'); mkdirSync(join(installSafety_fixture.installSafety_source, 'jev'), { recursive: true }); copyFileSync(join(installSafety_here, 'jev-setup.sh'), join(installSafety_fixture.installSafety_source, 'jev', 'jev-setup.sh'));
  const installSafety_existing = installSafety_seedExisting(installSafety_fixture); const installSafety_missing = 'plugins/jeopi/shared/jev-controller.mjs'; const installSafety_curl = installSafety_rawCurl(installSafety_fixture.installSafety_rootDir, { installSafety_missing }); const installSafety_result = installSafety_run(installSafety_fixture, installSafety_systemone('late'), { ...installSafety_systemoneEnv, installSafety_bin: installSafety_curl.installSafety_bin, JEO_SKILLS_RAW_BASE: 'https://raw.fixture.test/jev' });
  assert.notEqual(installSafety_result.status, 0); assert.match(`${installSafety_result.stdout}\n${installSafety_result.stderr}`, /Cannot fetch plugins\/jeopi\/shared\/jev-controller\.mjs/); assert.doesNotMatch(installSafety_result.stdout, /Setup complete/); installSafety_assertExistingUnchanged(installSafety_existing);
});
test('profile setup removes private staging directories after success and failure', () => {
  const installSafety_success = installSafety_local(); installSafety_ok(installSafety_run(installSafety_success, ['--profile', 'cleanup-success', '--mode', 'systemone', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'cleanup-model'])); assert.deepEqual(readdirSync(installSafety_success.installSafety_home).filter(installSafety_entry => /^jev-setup\./.test(installSafety_entry)), []);
  const installSafety_failure = installSafety_local(); writeFileSync(join(installSafety_failure.installSafety_source, 'jev', 'jev-harness.mjs'), 'not valid javascript\n'); const installSafety_result = installSafety_run(installSafety_failure, ['--profile', 'cleanup-failure', '--mode', 'systemone', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'cleanup-model']); assert.notEqual(installSafety_result.status, 0); assert.deepEqual(readdirSync(installSafety_failure.installSafety_home).filter(installSafety_entry => /^jev-setup\./.test(installSafety_entry)), []);
  const installSafety_writeFailure = installSafety_local(); const installSafety_writeProfile = installSafety_profile(installSafety_writeFailure.installSafety_home, 'cleanup-write'); mkdirSync(join(installSafety_writeProfile.installSafety_dir, 'cleanup-write.systemone.env'), { recursive: true }); const installSafety_writeResult = installSafety_run(installSafety_writeFailure, ['--profile', 'cleanup-write', '--mode', 'systemone', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'cleanup-model']); assert.notEqual(installSafety_writeResult.status, 0); assert.deepEqual(readdirSync(installSafety_writeFailure.installSafety_home).filter(installSafety_entry => /^jev-setup\./.test(installSafety_entry)), []); assert.deepEqual(readdirSync(installSafety_writeProfile.installSafety_dir).filter(installSafety_entry => /^\.cleanup-write\.mode/.test(installSafety_entry)), []);
});

test('ordinary raw setup replaces stale native and root controllers while config-only standalone retains both', () => {
  const installSafety_remote = installSafety_root('jev-raw-controller-replace-'); mkdirSync(join(installSafety_remote.installSafety_source, 'jev'), { recursive: true }); copyFileSync(join(installSafety_here, 'jev-setup.sh'), join(installSafety_remote.installSafety_source, 'jev', 'jev-setup.sh')); const installSafety_remoteInstalled = join(installSafety_remote.installSafety_home, '.agents', 'jev', 'plugins', 'shared'); mkdirSync(installSafety_remoteInstalled, { recursive: true }); const installSafety_stale = join(installSafety_remoteInstalled, 'jev-controller.mjs'); writeFileSync(installSafety_stale, 'stale-installed-controller\n'); const installSafety_staleRoot = join(installSafety_remote.installSafety_home, '.agents', 'jev', 'jev-plugin.mjs'); mkdirSync(dirname(installSafety_staleRoot), { recursive: true }); writeFileSync(installSafety_staleRoot, 'stale-root-controller\n'); const installSafety_remoteCurl = installSafety_rawCurl(installSafety_remote.installSafety_rootDir); installSafety_ok(installSafety_run(installSafety_remote, installSafety_systemone('replace'), { ...installSafety_systemoneEnv, installSafety_bin: installSafety_remoteCurl.installSafety_bin, JEO_SKILLS_RAW_BASE: 'https://raw.fixture.test/jev' })); assert.deepEqual(readFileSync(installSafety_stale), readFileSync(join(installSafety_here, 'plugins/shared/jev-controller.mjs'))); assert.notEqual(readFileSync(installSafety_stale, 'utf8'), 'stale-installed-controller\n'); assert.deepEqual(readFileSync(installSafety_staleRoot), readFileSync(join(installSafety_here, 'jev-plugin.mjs'))); assert.notEqual(readFileSync(installSafety_staleRoot, 'utf8'), 'stale-root-controller\n');
  const installSafety_config = installSafety_root('jev-raw-controller-config-'); mkdirSync(join(installSafety_config.installSafety_source, 'jev'), { recursive: true }); copyFileSync(join(installSafety_here, 'jev-setup.sh'), join(installSafety_config.installSafety_source, 'jev', 'jev-setup.sh')); const installSafety_configInstalled = installSafety_seedStandaloneConfigOnly(installSafety_config); const installSafety_configController = join(installSafety_configInstalled, 'plugins', 'shared', 'jev-controller.mjs'); mkdirSync(dirname(installSafety_configController), { recursive: true }); writeFileSync(installSafety_configController, 'stale-config-only-controller\n'); const installSafety_configRoot = join(installSafety_configInstalled, 'jev-plugin.mjs'); writeFileSync(installSafety_configRoot, 'stale-config-only-root-controller\n'); installSafety_ok(installSafety_run(installSafety_config, ['--profile', 'config-only', '--mode', 'api', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'config-only-model'])); assert.equal(readFileSync(installSafety_configController, 'utf8'), 'stale-config-only-controller\n'); assert.equal(readFileSync(installSafety_configRoot, 'utf8'), 'stale-config-only-root-controller\n');
});

test('config-only without a manifest does no curl/model/dependency work and retains or reports snapshot', () => {
  for (const installSafety_retain of [true, false]) {
    const installSafety_fixture = installSafety_local({ installSafety_manifest: false }); const installSafety_bin = join(installSafety_fixture.installSafety_rootDir, 'bin'); const installSafety_log = join(installSafety_fixture.installSafety_home, 'forbidden.log'); mkdirSync(installSafety_bin, { recursive: true });
    for (const installSafety_command of ['curl', 'python3', 'ollama', 'lms']) { const installSafety_stub = join(installSafety_bin, installSafety_command); writeFileSync(installSafety_stub, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(installSafety_command)} >> ${JSON.stringify(installSafety_log)}\nexit 97\n`); chmodSync(installSafety_stub, 0o755); }
    const installSafety_snapshot = join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'skills.json'); if (installSafety_retain) { mkdirSync(dirname(installSafety_snapshot), { recursive: true }); copyFileSync(installSafety_catalog, installSafety_snapshot); }
    const installSafety_before = installSafety_retain ? readFileSync(installSafety_snapshot) : null; const installSafety_result = installSafety_run(installSafety_fixture, ['--profile', `manifest-${installSafety_retain ? 'retain' : 'missing'}`, '--mode', 'api', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'config-only-model'], { PATH: `${installSafety_bin}:${process.env.PATH}` }); installSafety_ok(installSafety_result);
    assert.equal(existsSync(installSafety_log), false); assert.equal(existsSync(join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'models')), false); assert.equal(existsSync(join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'venv')), false); if (installSafety_retain) assert.deepEqual(readFileSync(installSafety_snapshot), installSafety_before); else { assert.equal(existsSync(installSafety_snapshot), false); assert.match(installSafety_result.stdout, /No skills catalog snapshot/); }
  }
});

test('config-only local source preserves model_policies and same-file catalog alias is idempotent', () => {
  const installSafety_fixture = installSafety_local(); const installSafety_args = ['--profile', 'snapshot', '--mode', 'systemone', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'snapshot-model']; installSafety_ok(installSafety_run(installSafety_fixture, installSafety_args));
  const installSafety_snapshot = join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'skills.json'); const installSafety_first = readFileSync(installSafety_snapshot); const installSafety_source = readFileSync(installSafety_catalog); assert.deepEqual(installSafety_first, installSafety_source); assert.deepEqual(JSON.parse(installSafety_first).model_policies, JSON.parse(installSafety_source).model_policies);
  installSafety_ok(installSafety_run(installSafety_fixture, installSafety_args, { JEO_SKILLS_CATALOG: installSafety_snapshot })); assert.deepEqual(readFileSync(installSafety_snapshot), installSafety_first); assert.match(readFileSync(join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'profiles', 'snapshot.env'), 'utf8'), /^JEV_ENABLED=false$/m);
});

test('new config-only profiles are OFF while existing enabled profiles stay enabled', () => {
  const installSafety_fixture = installSafety_local(); const installSafety_existing = installSafety_profile(installSafety_fixture.installSafety_home, 'existing'); installSafety_private(installSafety_existing.installSafety_base, 'JEV_ENABLED=true\nJEV_MODE=api\n'); installSafety_private(installSafety_existing.installSafety_api, 'JEV_API_KEY=existing-secret\n');
  installSafety_ok(installSafety_run(installSafety_fixture, ['--profile', 'new', '--mode', 'api', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'new-model'])); assert.match(readFileSync(join(installSafety_fixture.installSafety_home, '.agents', 'jev', 'profiles', 'new.env'), 'utf8'), /^JEV_ENABLED=false$/m);
  installSafety_ok(installSafety_run(installSafety_fixture, ['--profile', 'existing', '--mode', 'api', '--config-only', '--endpoint', 'https://api.fixture.test/v1/systemone', '--model', 'replacement-model'])); assert.match(readFileSync(installSafety_existing.installSafety_base, 'utf8'), /^JEV_ENABLED=true$/m); assert.match(readFileSync(installSafety_existing.installSafety_api, 'utf8'), /^JEV_API_KEY=existing-secret$/m);
});

test('legacy no-profile API and new System One provisioning remain compatible', () => {
  const installSafety_api = installSafety_local(); const installSafety_old = installSafety_run(installSafety_api, ['--mode', 'api'], { JEV_API_KEY: 'legacy-api-secret' }); installSafety_ok(installSafety_old); const installSafety_legacy = readFileSync(join(installSafety_api.installSafety_home, '.agents', 'jev', '.env'), 'utf8'); assert.match(installSafety_legacy, /^JEV_MODE=api$/m); assert.match(installSafety_legacy, /^JEV_API_KEY=legacy-api-secret$/m); assert.doesNotMatch(installSafety_old.stdout, /legacy-api-secret/);
  const installSafety_systemoneFixture = installSafety_local(); const installSafety_new = installSafety_run(installSafety_systemoneFixture, ['--mode', 'systemone'], { JEV_SYSTEMONE_ENDPOINT: 'https://systemone.fixture.test/v1/systemone', JEV_SYSTEMONE_MODEL: 'legacy-compatible-model' }); installSafety_ok(installSafety_new); const installSafety_newConfig = readFileSync(join(installSafety_systemoneFixture.installSafety_home, '.agents', 'jev', '.env'), 'utf8'); assert.match(installSafety_newConfig, /^JEV_MODE=systemone$/m); assert.match(installSafety_newConfig, /^JEV_SYSTEMONE_MODEL=legacy-compatible-model$/m);
});
