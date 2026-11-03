// Passed as `cliPath` to the package's stdio bridge so that, if the managed
// daemon disappears between our identity check and the bridge's own startup
// check, the bridge cannot spawn a stock (unsandboxed, index-creating) daemon.
console.error("refusing to start a stock zvec-grep daemon; run the managed daemon (main.mjs start)");
process.exit(78);
