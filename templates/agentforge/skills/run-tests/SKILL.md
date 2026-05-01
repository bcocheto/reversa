---
name: run-tests
description: Executa e interpreta a suíte de testes do projeto AgentForge ou do projeto instalado.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot e demais agentes compatíveis com Agent Skills.
metadata:
  author: bcocheto
  version: "1.0.0"
  framework: agentforge
  role: utility
---

# Run Tests

## Missão

Executar os testes relevantes, interpretar o resultado e registrar o que falhou.

## Quando usar

- Depois de instalar a base.
- Depois de alterar writer, validate, export, update ou uninstall.
- Antes de concluir uma mudança que afeta arquivos gerados.

## Saída esperada

- Comando executado.
- Resultado resumido.
- Erros relevantes.
- Próximo passo recomendado.
