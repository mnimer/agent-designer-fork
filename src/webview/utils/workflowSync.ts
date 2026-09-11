/**
 * workflowSync.ts - Workflow Graph Normalization and Synchronization Engine
 *
 * Purpose:
 * Provides pure utility functions to validate, normalize, and synchronize workflow
 * graph elements between disk/extension state and React Flow canvas state. Handles
 * automatic synchronization of parent agent `subAgents` lists with graph topology,
 * and derives workspace target directories from workflow document paths.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Pure Function Design: All synchronization and normalization algorithms are side-effect-free,
 *   enabling robust unit testing and high performance during rapid canvas graph re-evaluations.
 * - Sub-Agent Ordering Preservation: Preserves custom user ordering of sub-agents on parent nodes,
 *   while updating names, roles, and delegation types to match connected child agent nodes.
 * - Single-Root Hierarchy: Enforces trigger handle and target alignment to establish unambiguous
 *   workflow entrypoints.
 */

import { Node, Edge } from '@xyflow/react';
import { AgentData, SubAgentRef, TriggerData } from '../types';
import { sanitizeToolList } from '../data/builtinTools';
import { sanitizeAgentIdentifier } from '../../shared/identifierValidation';

/**
 * Normalizes raw nodes loaded from a document into typed ReactFlow Canvas nodes.
 *
 * @param loadedNodes - Array of raw node objects loaded from an .agent workflow file.
 * @returns Array of typed and structured ReactFlow Node objects with fallback coordinates and data models.
 */
export function normalizeLoadedNodes(loadedNodes: any[]): Node<any>[] {
  // NOTE: Defensive check for empty or non-array inputs
  if (!Array.isArray(loadedNodes)) {
    return [];
  }

  return loadedNodes.map((n) => {
    // Determine whether node is a trigger or agent
    const isTrigger =
      n.type === 'trigger' ||
      n.type === 'triggerNode' ||
      n.type === 'tester' ||
      n.type === 'chat' ||
      n.id?.includes('trigger') ||
      n.id?.includes('tester') ||
      Boolean(n.data?.triggerType || n.data?.triggerKind || n.data?.testConfig || n.data?.chatConfig);
    const type = isTrigger ? 'triggerNode' : 'agentNode';

    let data = { ...(n.data || {}) };

    if (isTrigger) {
      // Normalize trigger types and fallback configurations
      const triggerType = data.triggerType || data.triggerKind || 'tester';
      const normalizedTriggerType = triggerType === 'test' ? 'tester' : triggerType;
      data = {
        ...data,
        id: n.id,
        label: data.label || (normalizedTriggerType === 'tester' ? 'Test Suite Trigger' : 'Workflow Trigger'),
        triggerType: normalizedTriggerType,
        description: data.description || 'Workflow Trigger',
        config: data.config || data.testConfig || data.chatConfig || data.pubsubConfig || data.scheduledConfig || data.eventarcConfig || {},
      };
    } else {
      // Normalize agent types, model defaults, and tool assignments
      const agentLabel = data.label || 'Agent';
      data = {
        ...data,
        id: n.id,
        label: agentLabel,
        name: sanitizeAgentIdentifier(data.name || agentLabel || n.id),
        agentKind: data.agentKind || 'standard',
        model: data.model || data.standardConfig?.model || 'gemini-flash-latest',
        description: data.description || '',
        systemPrompt: data.systemPrompt || data.standardConfig?.systemInstruction || '',
        tools: sanitizeToolList(data.tools || data.standardConfig?.tools || []),
        memoryType: data.memoryType || data.standardConfig?.memory || 'none',
      };
    }

    return {
      id: n.id,
      type: type,
      position: n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
        ? n.position
        : { x: 100, y: 100 },
      data: data,
    };
  });
}

/**
 * Normalizes edge styles, handles, and stroke colors for workflow rendering.
 *
 * @param loadedEdges - Array of raw edge objects loaded from an .agent workflow file.
 * @returns Array of styled ReactFlow Edge objects with visual differentiation for triggers and agents.
 */
export function normalizeLoadedEdges(loadedEdges: any[]): Edge[] {
  // NOTE: Defensive check for empty or non-array inputs
  if (!Array.isArray(loadedEdges)) {
    return [];
  }

  return loadedEdges.map((e) => {
    const isTrigger =
      e.id?.includes('chat') ||
      e.id?.includes('tester') ||
      e.id?.includes('trigger') ||
      e.source?.includes('trigger') ||
      e.source?.includes('tester') ||
      e.source?.includes('chat') ||
      e.sourceHandle === 'trigger_out_right' ||
      e.sourceHandle === 'trigger_out_bottom';

    let stroke = e.style?.stroke || (isTrigger ? '#f59e0b' : '#3b82f6');
    if (
      stroke === '#ec4899' ||
      stroke === '#db2777' ||
      stroke === '#f472b6' ||
      stroke === '#eab308' ||
      stroke === 'rgb(236, 72, 153)' ||
      stroke?.toLowerCase().includes('pink') ||
      isTrigger
    ) {
      stroke = '#f59e0b';
    }

    let targetHandle = e.targetHandle || null;
    if (targetHandle === 'input_right') {
      targetHandle = 'input';
    }

    return {
      id: e.id || `e_${e.source}_${e.target}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle,
      animated: e.animated !== undefined ? e.animated : true,
      style: {
        strokeWidth: 2,
        strokeDasharray: isTrigger ? '5 5' : e.style?.strokeDasharray,
        ...e.style,
        stroke,
      },
    };
  });
}

/**
 * Synchronizes subAgents arrays for all agent nodes based on outgoing graph edges and latest node names/roles.
 * Preserves existing subAgent ordering configured by the user, appends newly connected targets,
 * prunes severed connections, and ensures names and roles match the target agent's current state.
 *
 * @param nodes - Current array of ReactFlow nodes.
 * @param edges - Current array of ReactFlow edges.
 * @returns Updated array of ReactFlow nodes with synchronized subAgents arrays on parent agent nodes.
 */
export function syncAgentSubAgents(nodes: Node<any>[], edges: Edge[]): Node<any>[] {
  const nodeMap = new Map<string, Node<any>>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  return nodes.map((node) => {
    // Only agent nodes possess subAgents delegation arrays
    if (node.type !== 'agentNode' && node.type !== 'agent') {
      return node;
    }

    let currentAgentData = (node.data as AgentData) || {};
    let routerConfigUpdated = false;
    let syncedRouterConfig = currentAgentData.routerConfig;

    // NOTE: Synchronize router branches if this agent is a router node
    if (currentAgentData.agentKind === 'router' && currentAgentData.routerConfig?.branches) {
      const branches = currentAgentData.routerConfig.branches;
      let branchChanged = false;
      const updatedBranches = branches.map((branch) => {
        // Find outgoing edge matching this router node and branch handle
        const matchingEdge = edges.find(
          (e) =>
            e.source === node.id &&
            e.sourceHandle === branch.id &&
            nodeMap.has(e.target) &&
            (nodeMap.get(e.target)!.type === 'agentNode' || nodeMap.get(e.target)!.type === 'agent')
        );
        const targetId = matchingEdge ? matchingEdge.target : undefined;
        if (branch.targetAgentId !== targetId) {
          branchChanged = true;
          return { ...branch, targetAgentId: targetId };
        }
        return branch;
      });

      if (branchChanged) {
        routerConfigUpdated = true;
        syncedRouterConfig = {
          ...currentAgentData.routerConfig,
          branches: updatedBranches,
        };
      }
    }

    const currentSubAgents: SubAgentRef[] = currentAgentData.subAgents || [];

    const isBottomHandle = (handleId?: string | null) => {
      if (!handleId) return true;
      if (handleId === 'output' || handleId === 'subagent' || handleId.startsWith('branch_')) return true;
      return handleId !== 'input' && handleId !== 'input_left';
    };

    // NOTE: Find all outgoing edges from bottom handle where target is an existing agent node
    const outgoingAgentEdges = edges.filter(
      (e) =>
        e.source === node.id &&
        isBottomHandle(e.sourceHandle) &&
        nodeMap.has(e.target) &&
        (nodeMap.get(e.target)!.type === 'agentNode' || nodeMap.get(e.target)!.type === 'agent')
    );
    const connectedTargetIds = Array.from(new Set(outgoingAgentEdges.map((e) => e.target)));
    const parentPattern = currentAgentData.subAgentPattern || 'parallel';

    // 1. Keep existing subAgents that are still connected, updating name, role, and delegationType
    const updatedExisting: SubAgentRef[] = [];
    currentSubAgents.forEach((sub) => {
      if (connectedTargetIds.includes(sub.agentId)) {
        const targetNode = nodeMap.get(sub.agentId)!;
        const targetData = targetNode.data as AgentData;
        updatedExisting.push({
          ...sub,
          name: targetData.label || sub.name || 'Agent',
          role: targetData.role !== undefined ? targetData.role : (sub.role || ''),
          // Inherit parent agent's subAgentPattern as delegationType so child never contradicts parent
          delegationType: (node.data as AgentData)?.subAgentPattern || sub.delegationType || 'parallel',
        });
      }
    });

    // 2. Append newly connected targets not already in subAgents list
    const existingIds = new Set(updatedExisting.map((s) => s.agentId));
    const newSubAgents: SubAgentRef[] = [];
    connectedTargetIds.forEach((targetId) => {
      if (!existingIds.has(targetId)) {
        const targetNode = nodeMap.get(targetId)!;
        const targetData = targetNode.data as AgentData;
        newSubAgents.push({
          agentId: targetId,
          name: targetData.label || 'Agent',
          role: targetData.role || '',
          delegationType: parentPattern,
        });
      }
    });

    const finalSubAgents = [...updatedExisting, ...newSubAgents];

    // NOTE: Perform shallow equality comparison to avoid unnecessary node reference mutations
    const isSameLength = currentSubAgents.length === finalSubAgents.length;
    const isSameContent =
      isSameLength &&
      currentSubAgents.every(
        (sub, idx) =>
          sub.agentId === finalSubAgents[idx].agentId &&
          sub.name === finalSubAgents[idx].name &&
          sub.role === finalSubAgents[idx].role &&
          sub.delegationType === finalSubAgents[idx].delegationType
      );

    if (isSameContent && !routerConfigUpdated) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        subAgents: finalSubAgents,
        ...(routerConfigUpdated ? { routerConfig: syncedRouterConfig } : {}),
      },
    };
  });
}

import { sanitizeFolderBaseName } from '../../shared/folderValidation';

/**
 * Derives a target output folder relative to the .agent file,
 * where the folder name matches the file name without .agent extension.
 * e.g., "agents/scratch/scratch-agent.agent" -> "./scratch_agent/"
 * e.g., "sample_support.agent" -> "./sample_support/"
 * e.g., ("scratch-flow.agent", "./src/agents/") -> "./src/agents/scratch_flow/"
 *
 * NOTE: Hyphens and non-alphanumeric characters are converted to underscores
 * to ensure the folder matches Python identifier requirements (letters, digits, underscores)
 * when deployed to Google Cloud Agent Engine.
 *
 * Logic Flow:
 * 1. Normalize separators and extract basename without .agent extension.
 * 2. Sanitize basename to a valid identifier via sanitizeFolderBaseName.
 * 3. Prefix with baseDir (defaulting to './' for direct relative target, or e.g. './src/agents/').
 *
 * @param filePathOrName - File path or filename (e.g. agents/scratch/scratch-agent.agent)
 * @param baseDir - Optional base directory prefix (defaults to './')
 * @returns Derived relative target directory path ending in '/'
 */
export const computeTargetFolder = (filePathOrName: string, baseDir: string = './'): string => {
  let prefix = baseDir || './';
  if (!prefix.endsWith('/')) {
    prefix = `${prefix}/`;
  }

  if (!filePathOrName) {
    return `${prefix}workflow/`;
  }
  const normalized = filePathOrName.replace(/\\/g, '/');
  const filename = normalized.split('/').filter(Boolean).pop() || normalized;
  let cleaned = filename.replace(/\.agent$/i, '');
  if (!cleaned) {
    cleaned = 'workflow';
  }
  cleaned = sanitizeFolderBaseName(cleaned);
  return `${prefix}${cleaned}/`;
};

/**
 * Resolves the final target output folder for an agent workflow document.
 *
 * Logic Flow:
 * 1. Normalize and strip legacy 'src/agents/' or './src/agents/' prefixes if present.
 * 2. Check if an explicit folder is provided in deployment or metadata:
 *    a. If explicitFolder is defined and is NOT a generic root directory
 *       (e.g., './', '.', './src/agents/', 'src/agents/', './agents/', 'agents/'),
 *       return explicitFolder directly (ensuring trailing slash).
 *    b. If explicitFolder is empty, undefined, or equals a generic root folder,
 *       derive a dedicated subfolder using the sanitized agent filename:
 *       e.g., "./" + "agent_20_questions_game.agent" -> "./agent_20_questions_game/".
 * 3. Ensure the resulting path ends with a forward slash for directory consistency.
 *
 * @param explicitFolder - Configured output folder from deployment node or metadata
 * @param filePathOrName - File path or name of the .agent document (e.g. "scratch-flow.agent")
 * @param defaultBaseDir - Default base folder (defaults to './')
 * @returns Final resolved output folder string with trailing slash
 */
export const resolveAgentOutputFolder = (
  explicitFolder?: string,
  filePathOrName?: string,
  defaultBaseDir: string = './'
): string => {
  let trimmed = explicitFolder?.trim();

  // Strip legacy src/agents prefixes if present
  if (trimmed) {
    if (trimmed.startsWith('./src/agents/')) {
      trimmed = `./${trimmed.slice('./src/agents/'.length)}`;
    } else if (trimmed.startsWith('src/agents/')) {
      trimmed = `./${trimmed.slice('src/agents/'.length)}`;
    }
  }

  // Generic folders that represent the root collection rather than an agent-specific folder
  const isGenericRoot =
    !trimmed ||
    trimmed === './' ||
    trimmed === '.' ||
    trimmed === './src/agents/' ||
    trimmed === './src/agents' ||
    trimmed === 'src/agents/' ||
    trimmed === 'src/agents' ||
    trimmed === './agents/' ||
    trimmed === './agents' ||
    trimmed === 'agents/' ||
    trimmed === 'agents';

  if (!isGenericRoot && trimmed) {
    // User or document explicitly specified a custom or agent-specific target folder (e.g. './game_20_questions/')
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  // Derive target folder using defaultBaseDir (defaulting to './') and sanitized agent file name
  const effectiveBase = defaultBaseDir || './';
  return computeTargetFolder(filePathOrName || 'workflow.agent', effectiveBase);
};

