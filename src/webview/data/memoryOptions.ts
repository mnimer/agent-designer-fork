import { AgentMemoryType, AgentMemoryConfig } from '../types';

export interface MemoryOptionDefinition {
  type: AgentMemoryType;
  name: string;
  category: 'LangGraph' | 'Database' | 'Short-Term' | 'Long-Term' | 'Stateless';
  badge: string;
  iconName: string;
  description: string;
  bestFor: string;
  defaultConfig: AgentMemoryConfig;
}

export const MEMORY_OPTIONS: MemoryOptionDefinition[] = [
  {
    type: 'none',
    name: 'Stateless (No Memory)',
    category: 'Stateless',
    badge: 'Stateless Execution',
    iconName: 'Ban',
    description: 'Zero memory retention across invocations. Every task executes in complete isolation.',
    bestFor: 'Pure functional workflows, deterministic pipelines, and one-off batch processors.',
    defaultConfig: {
      type: 'none',
    },
  },
];

export function getMemoryOption(type?: AgentMemoryType): MemoryOptionDefinition {
  return (
    MEMORY_OPTIONS.find((m) => m.type === type) ||
    MEMORY_OPTIONS.find((m) => m.type === 'none')!
  );
}
