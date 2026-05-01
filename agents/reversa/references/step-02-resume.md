# Passo 2 — Retomada de sessão

## 1. Leitura do estado

Leia `.agentforge/state.json` e `.agentforge/plan.md`.

## 2. Verificação de versão

Compare `.agentforge/version` com o npm registry. Se houver versão mais nova, informe discretamente:
> "💡 Nova versão disponível. Execute `npx agentforge update` quando quiser atualizar."

## 3. Saudação

Diga: "[Nome], bem-vindo de volta ao AgentForge! 🎼"

## 4. Resumo de progresso

Mostre:
- ✅ Fases concluídas (campo `completed` do state.json)
- 🔄 Fase atual (campo `phase`) com a última tarefa registrada em `checkpoints`
- ⏳ Próximas fases (campo `pending`)

Exemplo:
> "Progresso atual:
> ✅ Reconhecimento concluído
> 🔄 Escavação em andamento — módulos `auth` e `orders` analisados, `payments` e `users` pendentes
> ⏳ Interpretação, Geração, Revisão"

## 5. Modo de resposta a lacunas

Se `answer_mode` for `"file"`:
> "Lembre-se: suas respostas às perguntas devem ser preenchidas em `_agentforge/questions.md`. Me avise quando terminar."

Se `answer_mode` for `"chat"` (padrão):
> Continue normalmente — farei as perguntas aqui no chat.

## 6. Confirmação

Pergunte: "Continuamos de onde paramos?"

Após confirmação, retome a próxima tarefa pendente no plano (`.agentforge/plan.md`).

Consulte `references/checkpoint-guide.md` para as regras de escrita no state.json.
