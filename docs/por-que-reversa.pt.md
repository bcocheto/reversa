# Por que o agentforge existe

## O problema clássico

Imagine um sistema que entrou em produção em 2015. Ninguém que o escreveu ainda está na empresa. A documentação original era um arquivo Word que ninguém sabe onde foi parar. O código funciona, gera receita todos os dias, mas tem partes que ninguém ousa tocar porque *"mexeu aqui, quebrou ali"*.

Esse sistema carrega anos de conhecimento acumulado: regras de negócio implícitas, decisões arquiteturais tomadas às 23h antes de um deadline, lógica crítica enterrada em funções com nomes como `processar_v2_final_revisado`. O conhecimento existe. Ele está no código. Mas está preso lá dentro, inacessível para qualquer agente de IA.

---

## O problema com agentes de IA

Agentes de IA são transformadores para criar e evoluir software. Mas eles dependem de especificações para operar com segurança.

Para sistemas novos, funciona bem: você escreve a spec, o agente executa. Mas para sistemas legados? O agente não tem como saber o que não pode quebrar. Se você pedir para ele "refatorar o módulo de pagamentos", ele vai refatorar com base no que o código *parece* fazer, sem saber o que o código *deve* fazer.

O resultado é aquele momento clássico: o agente quebra uma regra de negócio que ninguém tinha documentado, e só descobrimos quando o cliente liga reclamando.

---

## A solução

O agentforge é a ponte entre o sistema legado e os agentes de IA.

Ele analisa o código existente e extrai o conhecimento acumulado: regras de negócio, fluxos, contratos entre módulos, decisões arquiteturais retroativas. Depois, transforma tudo em especificações executáveis, rastreáveis e prontas para uso por qualquer agente codificador.

O resultado não é documentação para humanos lerem numa tarde tranquila. São **contratos operacionais** que permitem a um agente evoluir o sistema com fidelidade ao que já existe.

---

## Para quem é

- **Empresas com sistemas legados** que querem modernizar sem reescrever tudo do zero
- **Equipes que usam vibe coding** e nunca escreveram specs formais (sem julgamento)
- **Desenvolvedores que herdaram um projeto** e precisam entender o que ele faz antes de mudar qualquer coisa
- **Qualquer pessoa** que tem um sistema funcionando mas sem documentação e quer usar agentes de IA para evoluí-lo com segurança

---

## O que o agentforge não é

O agentforge não é uma ferramenta de análise estática tradicional. Ele não gera cobertura de código, não faz linting, não aponta bugs. Ele é um framework de **extração de conhecimento**: pega o que está implícito no código e torna explícito em especificações formais.

Também não é uma solução mágica. Partes do sistema que são genuinamente inacessíveis pela análise estática (comportamento dependente de dados reais, regras que só existem na cabeça de alguém) vão aparecer como lacunas, marcadas com 🔴, esperando validação humana. Honestidade é parte do design.
