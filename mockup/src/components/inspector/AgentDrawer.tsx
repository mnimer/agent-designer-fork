/**
 * AgentDrawer Component
 *
 * Inspector drawer orchestrator that renders the appropriate property panel
 * (StandardAgentDrawer, RouterAgentDrawer, or A2AAgentDrawer) based on the agent's kind.
 * Supports tool inspection, per-agent tool property editing, and sub-agent orchestration.
 *
 * Architectural Decisions:
 * 1. Delegation: Routes directly to specialized agent drawers based on agentKind.
 * 2. Scoped Tool Editing: Forwards onEditTool to StandardAgentDrawer so tools can be edited per-agent.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { AgentData, ToolDefinition } from '../../types';
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
  onEditTool?: (tool: ToolDefinition) => void;
}

export const AgentDrawer: React.FC<AgentDrawerProps> = ({
  agent,
  allAgents,
  isOpen,
  onClose,
  onUpdateAgent,
  onOpenAddTool,
  onRemoveTool,
  onEditTool,
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
      onEditTool={onEditTool}
    />
  );
};
