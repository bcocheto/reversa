# Harness

O `harness/` controla a leitura da base AgentForge.
Aqui ficam as regras de carregamento, o roteamento inicial e o mapa entre modos de tarefa e engines.

## O que manter aqui

- Ordem de leitura dos arquivos.
- Regras para escolher o próximo modo.
- Mapeamento de engines e pontos de entrada.
- Mapa granular de contexto com arquivo e ranges.

## O que evitar

- Lógica executável complexa.
- Decisões escondidas em texto livre.
- Conteúdo que dependa de contexto local sensível.
