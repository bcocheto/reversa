# Imports

Esta pasta guarda snapshots de arquivos de instrução agentic encontrados no projeto antes de qualquer refatoração.

## Regras

- Os arquivos originais nunca são alterados por `agentforge ingest`.
- Cada snapshot registra origem, tipo inferido, hash e tamanho aproximado.
- Use os snapshots como base para auditoria, refatoração e sugestão de skills.

## Estrutura

- `snapshots/` contém snapshots versionados por caminho de origem e hash.
- `README.md` documenta a origem e o propósito desta área.
