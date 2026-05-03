# Agentic Blueprint Request

## Goal

Leia o evidence bundle completo antes de decidir.
Julgue semanticamente o projeto e a arquitetura agentic, não apenas por palavras-chave, heurísticas ou presença superficial de arquivos.
Decida a arquitetura agentic completa do projeto com base apenas na evidência do bundle.
Decida semanticamente quais agentes são necessários, quais skills cada agente precisa, quais `context_documents` cada agente usará, e quais `flows`, `policies` e `entrypoints` fazem sentido.
Preencha `.agentforge/ai/outbox/agentic-blueprint.yaml`.
Os sinais heurísticos do CLI não são recomendação final.
Não copie heurísticas do CLI como decisão final.

## Constraints

- Não crie agente sem evidência.
- Não crie o agente genérico "reviewer" sem papel específico.
- Não materialize arquivos manualmente.
- Não altere state/manifest.
- Justifique tudo com `source_evidence`.
- Evite papéis genéricos, duplicados ou sobrepostos.
- Se um item não tiver evidência suficiente, omita-o.

## Evidence bundle summary

Este bloco é preenchido dinamicamente pelo `renderAgenticBlueprintRequest(bundle)`.

## Evidence inventory

Este bloco é preenchido dinamicamente pelo `renderAgenticBlueprintRequest(bundle)`.

## Output schema

Retorne somente YAML válido usando o schema `agentic-blueprint`.

```yaml
blueprint:
  project:
    name: string
    type: string
    objective: string
    package_manager: string
    source_evidence:
      - path: path/to/evidence
        kind: evidence-kind
        reason: string
        snippet: string
  agents:
    - id: kebab-case
      name: string
      purpose: string
      responsibilities: [string]
      triggers: [string]
      skills: [skill-id]
      context: [relative/path.md]
      safety_limits: [string]
      source_evidence: [...]
  skills:
    - id: kebab-case
      name: string
      description: string
      owner_agents: [agent-id]
      steps: [string]
      source_evidence: [...]
  context_documents:
    - path: relative/path.md
      title: string
      purpose: string
      owner_agent: agent-id
      sections:
        - heading: string
          bullets: [string]
      source_evidence: [...]
  flows:
    - id: kebab-case
      name: string
      purpose: string
      owner_agents: [agent-id]
      steps: [string]
      source_evidence: [...]
  policies:
    - id: kebab-case
      name: string
      scope: string
      rule: string
      owner_agents: [agent-id]
      source_evidence: [...]
  routing:
    default_agent: agent-id
    rules:
      - trigger: string
        agent: agent-id
        reason: string
        source_evidence: [...]
    source_evidence: [...]
  entrypoints:
    - path: relative/path
      engine: codex|claude-code|cursor|gemini-cli|windsurf|antigravity|kiro|opencode|cline|roo-code|github-copilot|aider|amazon-q
      purpose: string
      owner_agent: agent-id
      source_evidence: [...]
  exports:
    - path: relative/path
      source: relative/path
      engine: valid-engine-id
      owner_agent: agent-id
      source_evidence: [...]
  migration_plan:
    mode: string
    steps:
      - title: string
        details: string
        source_evidence: [...]
    source_evidence: [...]
```

## Output rules

- Responda somente com YAML válido.
- O YAML deve preencher os campos `agents`, `skills`, `context_documents`, `flows`, `policies`, `routing`, `entrypoints`, `exports` e `migration_plan` quando houver evidência.
- Cada agent, skill, context document, flow, policy, routing rule, entrypoint, export e migration step deve carregar `source_evidence`.
- `source_evidence` deve usar paths reais vindos do evidence bundle e não pode inventar arquivos.
- Use nomes e ids estáveis, específicos e não genéricos.
- Não repita o mesmo papel em múltiplos agentes sem diferença semântica clara.
- Não traduza sinais heurísticos do CLI em decisão final sem justificar com evidence bundle.
