import { registerBeforeAgentStart } from './shared/jev-controller.mjs';

export const JEV_AGENT_ID = 'omp';

export function createJevExtension(api, options = {}) {
  return registerBeforeAgentStart(api, {
    agent: options.agent || JEV_AGENT_ID,
    profile: options.profile || process.env.JEV_PROFILE || undefined,
    envelope: 'systemPrompt',
    controllerPath: options.controllerPath,
    timeoutMs: options.timeoutMs,
  });
}

export default function jevOmpExtension(api) {
  return createJevExtension(api);
}
