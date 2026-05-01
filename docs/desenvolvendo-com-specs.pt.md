# Desenvolvendo com as specs

Depois que o agentforge gerou todas as specs em `_agentforge_sdd/`, você pode copiar esses arquivos para qualquer máquina e começar a construir o sistema do zero. Veja a ordem recomendada.

---

## Antes de escrever uma linha de código

Comece lendo esses três arquivos:

| Arquivo | Por que ler primeiro |
|---|---|
| `_agentforge_sdd/confidence-report.md` | Mostra o que tem alta confiança (verde) vs. lacunas (vermelho). Evita implementar algo baseado em inferência errada. |
| `_agentforge_sdd/gaps.md` | Lista o que o agentforge não conseguiu determinar. Preencha manualmente antes de começar. |
| `_agentforge_sdd/architecture.md` + diagramas C4 | Mostra a visão macro: camadas, módulos, fronteiras do sistema. |

---

## Ordem de implementação (bottom-up)

```
1. database/  +  erd-complete.md            (estrutura de dados, migrations)
2. domain.md  +  sdd/[entidades-core]       (regras de negócio centrais)
3. sdd/[serviços] ordenados por dependência (use dependencies.md como guia)
4. openapi/   +  contratos de API           (se houver)
5. ui/                                      (camada de apresentação por último)
```

---

## Qual sdd/ vem primeiro

Abra `_agentforge_sdd/traceability/code-spec-matrix.md`. Ele lista cada spec e suas dependências.

Implemente primeiro as specs que não dependem de nenhuma outra (folhas da árvore de dependências), e suba em direção às specs que integram múltiplos componentes.

---

## Mantendo a rastreabilidade durante o desenvolvimento

Use a `_agentforge_sdd/traceability/code-spec-matrix.md` como referência durante o desenvolvimento para saber qual trecho de código implementado corresponde a qual spec. Isso mantém a rastreabilidade precisa conforme o código cresce.

---

## Veja também

- [Saídas geradas](saidas/index.md): lista completa dos arquivos produzidos pelo agentforge
- [Escala de confiança](escala-confianca.md): como interpretar os marcadores 🟢🟡🔴 nas specs
