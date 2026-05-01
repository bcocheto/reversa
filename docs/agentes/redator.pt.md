# Writer

**Comando:** `/agentforge-writer`
**Fase:** 4 - Geração

---

## 📝 O tabelião

O tabelião transforma o que foi descoberto em contratos formais, precisos e rastreáveis. Cada cláusula tem grau de certeza declarado. O documento vale como contrato: um agente de IA pode reimplementar o sistema a partir dele.

---

## O que faz

O Writer transforma o que foi descoberto nas três fases anteriores em contratos formais: precisos, rastreáveis e suficientemente detalhados para que um agente de IA, sem acesso ao código original, possa reimplementar a funcionalidade com fidelidade.

Specs não são documentação para humanos lerem numa tarde tranquila. São contratos operacionais.

---

## O fluxo de trabalho

O Writer nunca gera tudo de uma vez. Projetos grandes têm muitos componentes, e gerar tudo em uma resposta consome contexto excessivo e impede revisão incremental. O fluxo é assim:

### 1. Montar e apresentar o plano

Antes de gerar qualquer arquivo, o Writer lê todos os artefatos das fases anteriores e monta uma lista completa do que vai gerar:

```
📋 Plano de geração: 12 itens

SDD:
  [ ] 1. sdd/auth.md
  [ ] 2. sdd/orders.md
  [ ] 3. sdd/payments.md

OpenAPI:
  [ ] 4. openapi/api-v1.yaml

User Stories:
  [ ] 5. user-stories/checkout.md

Rastreabilidade:
  [ ] 6. traceability/code-spec-matrix.md

Digite CONTINUAR para iniciar.
```

Você aprova (ou ajusta) o plano antes de qualquer geração.

### 2. Gerar um item por vez

Para cada item: gera o arquivo, salva, avisa o que foi concluído e o que vem a seguir, e **para**. Você confirma "CONTINUAR" antes do próximo. Isso permite revisar cada spec antes de avançar.

### 3. Code/Spec Matrix por último

O último item sempre é a matriz de rastreabilidade: qual arquivo de código corresponde a qual spec, com o nível de cobertura de cada um.

---

## Formato das specs SDD

Cada spec segue um template fixo com seções obrigatórias:

- **Visão geral** do componente
- **Responsabilidades** com classificação MoSCoW (Must / Should / Could / Won't)
- **Fluxos** e regras de negócio documentadas
- **Requisitos não funcionais** (inferidos do código, não inventados)
- **Critérios de aceitação** no formato `Dado / Quando / Então`, com happy path e cenários de falha

Cada afirmação é marcada com 🟢, 🟡 ou 🔴. Sem exceções.

---

## Arquivos gerados

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/sdd/[componente].md` | Spec por componente |
| `_agentforge_sdd/openapi/[api].yaml` | Spec de API (se aplicável) |
| `_agentforge_sdd/user-stories/[fluxo].md` | User stories (se aplicável) |
| `_agentforge_sdd/traceability/code-spec-matrix.md` | Matriz código-spec |
