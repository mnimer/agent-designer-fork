/**
 * AgentNode Re-export (TASK-223 / TASK-225 / TASK-226 / TASK-239)
 *
 * Purpose:
 * Provides backward-compatible re-export of AgentNode component from Canvas/nodes/AgentNode
 * so that both `components/nodes/AgentNode` and `components/Canvas/nodes/AgentNode` paths resolve.
 *
 * Architectural Decisions:
 * - Direct re-export of memoized component and types.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export * from '../Canvas/nodes/AgentNode';
export { default } from '../Canvas/nodes/AgentNode';
