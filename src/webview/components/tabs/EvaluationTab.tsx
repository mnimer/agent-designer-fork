/**
 * EvaluationTab.tsx - Local Test Evaluation Tab Wrapper Component
 *
 * Purpose:
 * Serves as the test runner wrapper displaying scenario assertions,
 * success metrics, performance logs, and feedback loops.
 *
 * Architectural Decisions:
 * - Decoupled wrapper forwarding control APIs to underlying runner.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { TestRunnerTab } from '../testing/TestRunnerTab';
import { AgentWorkflowDocument } from '../../../shared/types';
import { AgentData, GenerationConfig } from '../../types';

interface EvaluationTabProps {
  testPrompts: any[];
  agents: AgentData[];
  config: GenerationConfig;
  document?: AgentWorkflowDocument;
  onNavigateToDeployment?: () => void;
  hasChatTrigger?: boolean;
  onOpenPromptInChat?: (promptText: string) => void;
}

export const EvaluationTab: React.FC<EvaluationTabProps> = (props) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TestRunnerTab {...props} />
    </div>
  );
};
