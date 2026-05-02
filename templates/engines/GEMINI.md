# AgentForge

Este projeto usa AgentForge para gerenciar agentes customizados, subagentes, fluxos, políticas, playbooks de IA e memória operacional.

## Como ativar

Abra Gemini CLI e digite `agentforge`.

## Ao ativar

1. Leia `.agentforge/ai/README.md`.
2. Leia `.agentforge/ai/engines/gemini.md`.
3. Leia `.agentforge/state.json`.
4. Leia `.agentforge/scope.md`, se existir.
5. Leia `.agentforge/agents/`.
6. Leia `.agentforge/subagents/`, se existir.
7. Leia `.agentforge/flows/`.
8. Leia `.agentforge/policies/`.
9. Use `agentforge handoff` para obter o playbook da fase atual.
10. Nunca ignore as políticas em `.agentforge/policies/`.

## Regra de segurança

Não altere arquivos fora do escopo autorizado pelas políticas do AgentForge.
Peça aprovação humana quando uma política exigir.
