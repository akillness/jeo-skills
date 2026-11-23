# shellcheck shell=bash
# Sourced by scripts/*/run_agent.sh. When the llm_base_url input is set, Claude
# Code talks to that Anthropic-compatible API (OpenRouter, DeepSeek, Kimi, GLM,
# MiniMax, Qwen...) with the LLM_API_KEY secret instead of Claude, and MODEL is
# the provider's model name. Nothing changes when LLM_BASE_URL is empty.
# Results depend on how well that model reads screenshots and reasons:
# see docs/cheaper-models.md.
if [ -n "${LLM_BASE_URL:-}" ]; then
  if [ -z "${LLM_API_KEY:-}" ]; then
    echo "llm_base_url is set, but the LLM_API_KEY secret is empty" >&2
    return 1
  fi
  case "${MODEL:-}" in
    "" | sonnet | opus | haiku | default)
      echo "llm_base_url is set: put the provider's model name in the model input, not '${MODEL:-}'" >&2
      return 1 ;;
  esac
  export ANTHROPIC_BASE_URL="${LLM_BASE_URL%/}" ANTHROPIC_AUTH_TOKEN="$LLM_API_KEY" ANTHROPIC_API_KEY=""
  unset CLAUDE_CODE_OAUTH_TOKEN
  # Claude Code also sends small background requests (titles, summaries) to its
  # "haiku" slot: the provider only knows MODEL, so every slot uses it
  for v in ANTHROPIC_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL \
           ANTHROPIC_DEFAULT_HAIKU_MODEL CLAUDE_CODE_SUBAGENT_MODEL; do
    export "$v=$MODEL"
  done
  export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 API_TIMEOUT_MS="${API_TIMEOUT_MS:-600000}"
  llm_host=${LLM_BASE_URL#*://}; llm_host=${llm_host%%/*}
  echo "Model $MODEL through ${llm_host##*@}"
fi
