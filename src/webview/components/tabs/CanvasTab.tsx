/**
 * CanvasTab.tsx - Diagram Canvas Workspace Component
 *
 * Purpose:
 * Renders the interactive React Flow designer workspace, node palette card,
 * and property drawers for agent, trigger, and tool nodes.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Modular design following "Props In, Events Up" paradigm.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useRef } from 'react';
import { ReactFlow, Connection, Edge, Node } from '@xyflow/react';

// Domain Types
import {
  AgentData,
  TriggerData,
  ToolDefinition,
  GenerationConfig,
  McpToolConfig,
  SampleWorkflowDefinition,
} from '../../types';

// UI Panels & Drawers
import { PaletteCard } from '../Canvas/PaletteCard';
import { AgentDrawer } from '../inspector/AgentDrawer';
import { TriggerDrawer } from '../inspector/TriggerDrawer';
import { ToolPropertyDrawer } from '../inspector/ToolPropertyDrawer';

// Modular Canvas Widgets
import { CanvasToolbar } from '../Canvas/CanvasToolbar';
import { CanvasEmptyState } from '../Canvas/CanvasEmptyState';
import { ValidationToast } from '../Canvas/ValidationToast';

// Custom Nodes & Edges
import { AgentNode } from '../Canvas/nodes/AgentNode';
import { TriggerNode } from '../Canvas/nodes/TriggerNode';
import { WorkflowEdge as CustomWorkflowEdge } from '../Canvas/edges/WorkflowEdge';

const nodeTypes = {
  agentNode: AgentNode,
  triggerNode: TriggerNode,
  agent: AgentNode,
  trigger: TriggerNode,
};

const edgeTypes = {
  default: CustomWorkflowEdge,
  workflow: CustomWorkflowEdge,
  workflowEdge: CustomWorkflowEdge,
};

interface CanvasTabProps {
  nodes: Node[];
  edges: Edge[];
  enrichedNodes: Node[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onNodeDragStop: () => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | Edge) => boolean;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onNodeClick: (event: any, node: any) => void;
  onPaneClick: () => void;
  onNodesDelete: (nodesToDelete: Node[]) => void;

  // History & Toolbar State
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  settings: {
    showMiniMap?: boolean;
    defaultModel?: string;
    defaultTemperature?: number;
    defaultMemoryType?: string;
    defaultAgentTheme?: string;
  };

  // State Overlays & Drawers
  validationWarning: string | null;
  onDismissValidationWarning: () => void;
  handleAddRootWithTestSuite: () => void;
  tools: ToolDefinition[];
  selectedAgentNode: Node | undefined;
  handleAddAgentDirect: (kind?: any) => void;
  handleAddPatternDirect: (patternType: any) => void;
  handleAddTriggerDirect: (triggerType: any) => void;
  setIsAdvisorOpen: (open: boolean) => void;
  handleOpenSampleInNewTab: (sample: SampleWorkflowDefinition) => void;
  handleOpenSampleInfo?: (sample: SampleWorkflowDefinition) => void;
  handleAddSpecificTool: (agentId: string, tool: ToolDefinition) => void;
  selectedAgentId: string | null;
  isToolDrawerOpen: boolean;
  isTriggerDrawerOpen: boolean;
  setSelectedAgentId: (id: string | null) => void;
  setToolModalAgentId: (id: string | null) => void;
  handleRemoveTool: (agentId: string, toolId: string) => void;
  handleOpenEditTool: (tool: ToolDefinition) => void;
  handleOpenEditAgentTool: (agentId: string, tool: ToolDefinition) => void;
  handleCreateCustomTool: () => void;
  handleCreateMcpTool: () => void;
  selectedTriggerNode: Node | undefined;
  handleUpdateTriggerData: (triggerId: string, partial: Partial<TriggerData>) => void;
  selectedTriggerId: string | null;
  setSelectedTriggerId: (id: string | null) => void;
  setIsTriggerDrawerOpen: (open: boolean) => void;
  handleDeleteTrigger: (id: string) => void;
  reconnectTriggersToRoot: (rootAgentId: string) => void;

  // Tool Drawer Props
  editingTool: ToolDefinition | null;
  setEditingToolScope: (scope: any) => void;
  setIsToolDrawerOpen: (open: boolean) => void;
  handleSaveTool: (tool: ToolDefinition) => Promise<boolean>;
  handleUpdateTool?: (tool: ToolDefinition) => void;
  handleDeleteTool: (toolId: string) => Promise<boolean>;
  editingToolScope: any;
  config: GenerationConfig;
  handleTestMcpHandshake: (mcpConfig: McpToolConfig) => Promise<any>;
  handleStartOAuthFlow: (options: any) => Promise<any>;
  handleSaveMcpSecret: (secretName: string, envVar: string, token: string) => Promise<any>;
  handleGetMcpSecret: (secretName: string, envVar?: string) => Promise<any>;

  isPanelMaximized: boolean;
  agentNodes: AgentData[];
  onUpdateAgent: (partial: Partial<AgentData>) => void;
  samples?: SampleWorkflowDefinition[];
}

export const CanvasTab: React.FC<CanvasTabProps> = ({
  nodes,
  edges,
  enrichedNodes,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onConnect,
  isValidConnection,
  onDrop,
  onDragOver,
  onNodeClick,
  onPaneClick,
  onNodesDelete,

  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  settings,

  validationWarning,
  onDismissValidationWarning,
  handleAddRootWithTestSuite,
  tools,
  selectedAgentNode,
  handleAddAgentDirect,
  handleAddPatternDirect,
  handleAddTriggerDirect,
  setIsAdvisorOpen,
  handleOpenSampleInNewTab,
  handleAddSpecificTool,
  selectedAgentId,
  isToolDrawerOpen,
  isTriggerDrawerOpen,
  setSelectedAgentId,
  setToolModalAgentId,
  handleRemoveTool,
  handleOpenEditTool,
  handleOpenEditAgentTool,
  handleCreateCustomTool,
  handleCreateMcpTool,
  selectedTriggerNode,
  handleUpdateTriggerData,
  selectedTriggerId,
  setSelectedTriggerId,
  setIsTriggerDrawerOpen,
  handleDeleteTrigger,
  reconnectTriggersToRoot,

  editingTool,
  setEditingToolScope,
  setIsToolDrawerOpen,
  handleSaveTool,
  handleUpdateTool,
  handleDeleteTool,
  editingToolScope,
  config,
  handleTestMcpHandshake,
  handleStartOAuthFlow,
  handleSaveMcpSecret,
  handleGetMcpSecret,

  isPanelMaximized,
  agentNodes,
  onUpdateAgent,
  samples,
  handleOpenSampleInfo,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className={`relative w-full bg-[#181818] overflow-hidden transition-all ${
        isPanelMaximized ? 'h-0 min-h-0 hidden' : 'flex-1 min-h-[120px]'
      }`}
      ref={reactFlowWrapper}
    >
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineStyle={{ stroke: '#f59e0b', strokeWidth: 2 }}
        onNodesDelete={onNodesDelete}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2.5}
      >
        {/* TOP-RIGHT CANVAS CONTROLS & MINIMAP */}
        <CanvasToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onAutoLayout={onAutoLayout}
          showMiniMap={settings.showMiniMap}
        />

        {/* Empty Diagram State Overlay */}
        {nodes.length === 0 && (
          <CanvasEmptyState onAddRootEngine={handleAddRootWithTestSuite} />
        )}

        {/* Validation Warning Toast */}
        <ValidationToast
          warning={validationWarning}
          onDismiss={onDismissValidationWarning}
        />
      </ReactFlow>

      {/* Floating Palette on Left */}
      <PaletteCard
        tools={tools}
        samples={samples}
        selectedAgent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
        onAddAgent={handleAddAgentDirect}
        onAddPattern={handleAddPatternDirect}
        onAddTrigger={handleAddTriggerDirect}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
        onOpenEditTool={handleOpenEditTool}
        onCreateCustomTool={handleCreateCustomTool}
        onCreateMcpTool={handleCreateMcpTool}
        onOpenSample={handleOpenSampleInNewTab}
        onOpenSampleInfo={handleOpenSampleInfo}
        onAddToolToAgent={(tool) => {
          if (selectedAgentId) {
            handleAddSpecificTool(selectedAgentId, tool);
          } else if (nodes.length > 0) {
            const firstAgent = nodes.find((n) => n.type === 'agentNode');
            if (firstAgent) handleAddSpecificTool(firstAgent.id, tool);
          }
        }}
      />

      {/* Slide-out Agent Inspector Drawer */}
      <AgentDrawer
        agent={
          selectedAgentNode &&
          selectedAgentNode.type !== 'triggerNode' &&
          selectedAgentNode.type !== 'trigger' &&
          !(selectedAgentNode.data as any)?.triggerType &&
          !(selectedAgentNode.data as any)?.triggerKind
            ? {
                ...(selectedAgentNode.data as AgentData),
                id: (selectedAgentNode.data as AgentData)?.id || selectedAgentNode.id,
              }
            : null
        }
        allAgents={agentNodes}
        edges={edges}
        isOpen={!!selectedAgentId && !isToolDrawerOpen && !isTriggerDrawerOpen}
        onClose={() => setSelectedAgentId(null)}
        onUpdateAgent={onUpdateAgent}
        onOpenAddTool={() => selectedAgentId && setToolModalAgentId(selectedAgentId)}
        onRemoveTool={(toolId) => selectedAgentId && handleRemoveTool(selectedAgentId, toolId)}
        onEditTool={(tool) => selectedAgentId && handleOpenEditAgentTool(selectedAgentId, tool)}
        onSelectAgent={(agentId) => setSelectedAgentId(agentId)}
      />

      {/* Slide-out Trigger Inspector Drawer */}
      <TriggerDrawer
        trigger={selectedTriggerNode ? (selectedTriggerNode.data as TriggerData) : null}
        availableAgents={agentNodes}
        isOpen={isTriggerDrawerOpen && !!selectedTriggerNode}
        onClose={() => {
          setSelectedTriggerId(null);
          setIsTriggerDrawerOpen(false);
        }}
        onUpdateTrigger={(partial) => {
          if (selectedTriggerId) handleUpdateTriggerData(selectedTriggerId, partial);
        }}
        onDeleteTrigger={() => {
          if (selectedTriggerId) handleDeleteTrigger(selectedTriggerId);
        }}
        onReconnectToRoot={reconnectTriggersToRoot}
      />

      {/* Slide-out Tool Definition Property Panel */}
      <ToolPropertyDrawer
        tool={editingTool}
        isOpen={isToolDrawerOpen}
        onClose={() => {
          setIsToolDrawerOpen(false);
          setEditingToolScope(null);
        }}
        onSaveTool={handleSaveTool}
        onUpdateTool={handleUpdateTool}
        onDeleteTool={handleDeleteTool}
        scope={editingToolScope?.type || 'global'}
        agentName={
          editingToolScope?.type === 'agent'
            ? (nodes.find((n) => n.id === editingToolScope.agentId)?.data as AgentData)?.label
            : undefined
        }
        selectedAgent={selectedAgentNode ? (selectedAgentNode.data as AgentData) : null}
        targetLanguage={config.language || 'python'}
        onTestMcpHandshake={handleTestMcpHandshake}
        onStartOAuthFlow={handleStartOAuthFlow}
        onSaveMcpSecret={handleSaveMcpSecret}
        onGetMcpSecret={handleGetMcpSecret}
        onAttachToAgent={(agentId, tool) => {
          handleAddSpecificTool(agentId, tool);
          setIsToolDrawerOpen(false);
          setEditingToolScope(null);
        }}
      />
    </div>
  );
};
