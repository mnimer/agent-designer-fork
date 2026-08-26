import React from 'react';
import { AgentData } from '../../types';
import { StandardAgentDrawer } from './StandardAgentDrawer';
import { A2AAgentDrawer } from './A2AAgentDrawer';
import { RouterAgentDrawer } from './RouterAgentDrawer';

interface AgentDrawerProps {
  agent: AgentData | null;
  allAgents: AgentData[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateAgent: (updatedData: Partial<AgentData>) => void;
  onOpenAddTool: () => void;
  onRemoveTool: (toolId: string) => void;
}

export const AgentDrawer: React.FC<AgentDrawerProps> = ({
  agent,
  allAgents,
  isOpen,
  onClose,
  onUpdateAgent,
  onOpenAddTool,
  onRemoveTool,
}) => {
  if (!isOpen || !agent) return null;

  // Render distinct property panel based on the node clicked
  if (agent.agentKind === 'a2a') {
    return (
      <A2AAgentDrawer
        agent={agent}
        allAgents={allAgents}
        onClose={onClose}
        onUpdateAgent={onUpdateAgent}
      />
    );
  }

  if (agent.agentKind === 'router') {
    return (
      <RouterAgentDrawer
        agent={agent}
        allAgents={allAgents}
        onClose={onClose}
        onUpdateAgent={onUpdateAgent}
      />
    );
  }

  return (
    <StandardAgentDrawer
      agent={agent}
      allAgents={allAgents}
      onClose={onClose}
      onUpdateAgent={onUpdateAgent}
      onOpenAddTool={onOpenAddTool}
      onRemoveTool={onRemoveTool}
    />
  );
};
