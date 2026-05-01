# Architect

**Comando:** `/agentforge-architect`
**Fase:** 3 - Interpretação

---

## 📐 O cartógrafo

O cartógrafo visita um território e produz mapas formais: planta baixa, mapa de elevação, planta estrutural. Alguém que nunca pisou lá consegue entender tudo olhando para os mapas.

---

## O que faz

O Architect visita o território que foi escavado e interpretado, e produz mapas formais. A ideia é que alguém que nunca pisou no projeto consiga entender a estrutura completa olhando apenas para o que o Architect produziu.

Ele trabalha junto com o Detective na Fase 3. Enquanto o Detective extrai o *porquê* (regras de negócio, decisões), o Architect sintetiza o *como* (estrutura, componentes, integrações).

---

## O que ele produz

### Diagramas C4

O Architect gera os três níveis do modelo C4:

**Contexto (Nível 1):** o sistema no centro, os usuários ao redor, os sistemas externos com que se integra e os protocolos de comunicação.

**Containers (Nível 2):** aplicações, serviços, bancos de dados, filas e caches, com a tecnologia de cada um e como se comunicam entre si.

**Componentes (Nível 3):** para os containers mais relevantes, os componentes internos e suas responsabilidades.

Todos os diagramas são gerados em Mermaid, prontos para renderizar em qualquer Markdown.

### ERD completo

Todas as entidades com atributos principais, relacionamentos com cardinalidades (1:1, 1:N, N:M), chaves primárias e estrangeiras. Em Mermaid (`erDiagram`).

### Integrações externas

APIs REST/GraphQL consumidas e produzidas, webhooks, eventos, mensagens, protocolos e formatos de dados.

### Dívidas técnicas

Código duplicado, padrões inconsistentes, dependências críticas desatualizadas e ausência de testes em módulos críticos.

### Spec Impact Matrix

Uma matriz que mostra qual componente impacta qual. Útil para saber o raio de blast de uma mudança antes de fazer.

---

## Arquivos gerados

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/architecture.md` | Visão geral arquitetural |
| `_agentforge_sdd/c4-context.md` | Diagrama C4: Contexto |
| `_agentforge_sdd/c4-containers.md` | Diagrama C4: Containers |
| `_agentforge_sdd/c4-components.md` | Diagrama C4: Componentes |
| `_agentforge_sdd/erd-complete.md` | ERD completo em Mermaid |
| `_agentforge_sdd/traceability/spec-impact-matrix.md` | Matriz de impacto |
