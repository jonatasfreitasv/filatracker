export type RunzTerminalId = 'cursor-agent' | 'claude-code' | 'codex' | 'terminal';

export type RunzTerminalTarget = {
  id: RunzTerminalId;
  label: string;
  description: string;
  colorClass: string;
  launchCommand?: string;
};

export const RUNZ_TERMINALS: RunzTerminalTarget[] = [
  {
    id: 'cursor-agent',
    label: 'Cursor Agent',
    description:
      'Interactive ZSH terminal that opens the Cursor Agent CLI inside the monorepo root.',
    colorClass: 'runz-tab-ai-agent',
    launchCommand: 'cursor-agent',
  },
  {
    id: 'codex',
    label: 'Codex',
    description: 'Interactive ZSH terminal that opens the Codex CLI inside the monorepo root.',
    colorClass: 'runz-tab-ai-agent',
    launchCommand: 'codex',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description:
      'Interactive ZSH terminal that opens the Claude Code CLI inside the monorepo root.',
    colorClass: 'runz-tab-ai-agent',
    launchCommand: 'claude',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Free ZSH shell inside the monorepo root — run any command.',
    colorClass: 'runz-tab-terminal',
  },
];
