import inquirer from 'inquirer';
import { applyOrangeTheme, ORANGE_PREFIX } from './orange-prompts.js';
import { PRODUCT } from '../product.js';

applyOrangeTheme();

const INTERNAL_AGENT_CHOICES = [
  { name: 'AgentForge: orquestrador central', value: PRODUCT.skillsPrefix, checked: true },
  { name: 'Levantador de escopo: entende contexto, stack e restrições', value: `${PRODUCT.skillsPrefix}-scope-scout`, checked: true },
  { name: 'Arquiteto de agentes: propõe agentes e subagentes', value: `${PRODUCT.skillsPrefix}-agent-architect`, checked: true },
  { name: 'Designer de fluxos: desenha fluxos operacionais', value: `${PRODUCT.skillsPrefix}-flow-designer`, checked: true },
  { name: 'Guardião de políticas: define permissões e aprovações', value: `${PRODUCT.skillsPrefix}-policy-guard`, checked: true },
  { name: 'Exportador: prepara exportações para engines', value: `${PRODUCT.skillsPrefix}-exporter`, checked: true },
  { name: 'Revisor: valida conflitos e cobertura', value: `${PRODUCT.skillsPrefix}-reviewer`, checked: true },
];

const P = { prefix: ORANGE_PREFIX };

export async function runInstallPrompts(detectedEngines) {
  const engineChoices = detectedEngines.map(e => ({
    name: `${e.name}${e.star ? ' ⭐' : ''}`,
    value: e.id,
    checked: e.detected,
  }));

  const answers = await inquirer.prompt([
    {
      ...P,
      type: 'checkbox',
      name: 'engines',
      message: 'Quais engines você quer suportar?',
      choices: engineChoices,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Selecione ao menos uma engine.',
    },
    {
      ...P,
      type: 'checkbox',
      name: 'internal_agents',
      message: 'Agentes internos para instalar:',
      choices: INTERNAL_AGENT_CHOICES,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Selecione pelo menos um agente interno.',
    },
    {
      ...P,
      type: 'input',
      name: 'project_name',
      message: 'Nome do projeto:',
      default: process.cwd().split(/[\\/]/).pop(),
      validate: (v) => v.trim().length > 0 || 'O nome não pode ficar vazio.',
    },
    {
      ...P,
      type: 'input',
      name: 'user_name',
      message: 'Como os agentes devem chamar você?',
      validate: (v) => v.trim().length > 0 || 'O nome não pode ficar vazio.',
    },
    {
      ...P,
      type: 'input',
      name: 'chat_language',
      message: 'Idioma das interações com os agentes:',
      default: 'pt-br',
    },
    {
      ...P,
      type: 'input',
      name: 'doc_language',
      message: 'Idioma dos documentos e specs gerados:',
      default: 'Português',
    },
    {
      ...P,
      type: 'input',
      name: 'output_folder',
      message: 'Pasta de saída para specs:',
      default: PRODUCT.outputDir,
    },
    {
      ...P,
      type: 'list',
      name: 'git_strategy',
      message: 'Como tratar os artefatos no git?',
      loop: false,
      choices: [
        { name: 'Comitar junto com o projeto (recomendado para equipes)', value: 'commit' },
        { name: 'Adicionar ao .gitignore (uso pessoal)', value: 'gitignore' },
      ],
    },
    {
      ...P,
      type: 'list',
      name: 'response_mode',
      message: 'Como a equipe deve coletar respostas de follow-up?',
      loop: false,
      choices: [
        { name: 'No chat (mais rápido)', value: 'chat' },
        { name: 'No arquivo questions.md (mais organizado)', value: 'file' },
      ],
    },
  ]);

  return {
    ...answers,
    internal_agents: answers.internal_agents,
  };
}

export async function askMergeStrategy(filePath) {
  const { strategy } = await inquirer.prompt([
    {
      ...P,
      type: 'list',
      name: 'strategy',
      message: `O arquivo "${filePath}" já existe. O que você quer fazer?`,
      loop: false,
      choices: [
        { name: `Mesclar: adicionar o conteúdo do ${PRODUCT.name} ao final`, value: 'merge' },
        { name: 'Pular: manter o arquivo como está', value: 'skip' },
      ],
    },
  ]);
  return strategy;
}
