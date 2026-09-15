/**
 * ChatTab.tsx - Interactive Chat Tab Wrapper Component
 *
 * Purpose:
 * Serves as the interactive conversational testbed wrapper for testing
 * generated multi-agent workflows in a live streaming layout.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decoupled wrapper forwarding control APIs to underlying runner.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { ChatRunnerTab, ChatRunnerTabProps } from '../chat/ChatRunnerTab';

export const ChatTab: React.FC<ChatRunnerTabProps> = (props) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <ChatRunnerTab {...props} />
    </div>
  );
};
