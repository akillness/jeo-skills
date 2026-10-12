import { registerBeforeAgentStart } from './shared/jev-controller.mjs';

export const JEV_AGENT_ID = 'pi';

export function createJevExtension(api, options = {}) {
  return registerBeforeAgentStart(api, {
    agent: options.agent || JEV_AGENT_ID,
    profile: options.profile || process.env.JEV_PROFILE || undefined,
    envelope: 'systemPrompt-string',
    controllerPath: options.controllerPath,
    timeoutMs: options.timeoutMs,
  });
}

export default function jevPiExtension(api) {
  return createJevExtension(api);
}
