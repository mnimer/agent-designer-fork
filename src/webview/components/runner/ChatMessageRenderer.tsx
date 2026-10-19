/**
 * ChatMessageRenderer Re-export Module
 *
 * Re-exports ChatMessageRenderer and its associated types from the chat directory
 * to ensure backward compatibility and seamless imports from runner paths.
 *
 * Architectural Decisions:
 * 1. Path Unification: Allows runner components and tabs to import ChatMessageRenderer
 *    consistently from the runner package without duplicating component logic.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export * from '../chat/ChatMessageRenderer';
export { default } from '../chat/ChatMessageRenderer';
