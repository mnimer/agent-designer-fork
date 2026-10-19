"""
Travel Concierge Memory Toolset

Purpose:
Provides session state memory persistence tools (`memorize`, `memorize_list`, `forget`)
used by the Planning, In-Trip, and Post-Trip agents to record user preferences,
itinerary timestamps, and selected travel options across turns.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Uses Google ADK `ToolContext.state` when available and gracefully supports standalone
  dictionary state for local unit test execution.
"""

from typing import Any, Dict, Optional

# Fallback in-memory dictionary when executed outside an active ADK ToolContext
_FALLBACK_STATE: Dict[str, Any] = {}


def _resolve_state_store(tool_context: Optional[Any] = None) -> Dict[str, Any]:
    """
    Resolves the underlying mutable state dictionary from an ADK ToolContext
    or returns the module fallback state dictionary.

    Args:
        tool_context: Optional ADK ToolContext instance passed at runtime.

    Returns:
        Mutable dictionary representing current session state.
    """
    # Section 1: Check if tool_context provides a valid state attribute
    if tool_context is not None and hasattr(tool_context, "state") and isinstance(tool_context.state, dict):
        return tool_context.state
    # Section 2: Return fallback dictionary for standalone testing
    return _FALLBACK_STATE


def memorize(key: str, value: str, tool_context: Optional[Any] = None) -> Dict[str, str]:
    """
    Memorizes a single key-value pair in the agent session state.

    Args:
        key: The label indexing the memory slot (e.g., 'itinerary_datetime', 'food_preference').
        value: The string value to store in session state.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        Status confirmation dictionary.
    """
    # Section 1: Obtain session state store
    mem_dict = _resolve_state_store(tool_context)

    # Section 2: Store the key-value pair and return confirmation
    mem_dict[key] = value
    return {"status": f'Stored "{key}": "{value}"'}


def memorize_list(key: str, value: str, tool_context: Optional[Any] = None) -> Dict[str, str]:
    """
    Appends an item to a list stored under `key` in the agent session state.

    Args:
        key: The list label in session state (e.g., 'visited_places', 'dietary_notes').
        value: The item to append if not already present.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        Status confirmation dictionary.
    """
    # Section 1: Obtain session state store and initialize list if missing
    mem_dict = _resolve_state_store(tool_context)
    if key not in mem_dict or not isinstance(mem_dict[key], list):
        mem_dict[key] = []

    # Section 2: Append unique value to list
    if value not in mem_dict[key]:
        mem_dict[key].append(value)
    return {"status": f'Stored "{key}": "{value}"'}


def forget(key: str, value: str, tool_context: Optional[Any] = None) -> Dict[str, str]:
    """
    Removes a specific value from a list or clears a key in session state.

    Args:
        key: The state key to modify.
        value: The specific value to remove from the stored list.
        tool_context: Optional ADK ToolContext injected by the runner.

    Returns:
        Status confirmation dictionary.
    """
    # Section 1: Resolve state store
    mem_dict = _resolve_state_store(tool_context)

    # Section 2: Remove item if present in list or matching scalar value
    if key in mem_dict:
        if isinstance(mem_dict[key], list) and value in mem_dict[key]:
            mem_dict[key].remove(value)
        elif mem_dict[key] == value:
            del mem_dict[key]
    return {"status": f'Removed "{key}": "{value}"'}
