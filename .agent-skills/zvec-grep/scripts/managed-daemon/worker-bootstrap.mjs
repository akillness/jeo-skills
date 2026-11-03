// Preloaded (node --import) into every worker thread so the egress and
// index-lifecycle guards apply to worker code too.
import { installGuardsFromEnvironment } from "./egress-guard.mjs";

installGuardsFromEnvironment();
