/**
 * Python Codegen Escaping & Literal Serialization Utilities
 *
 * Purpose:
 * Provides extremely secure, reliable, and injection-proof formatting of
 * user-controlled string and object inputs into valid Python code representations.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Quote-Container Double Quotes ("..."): Double quotes are the standard
 *   Python string literal container. Every backslash is escaped first, preventing
 *   the user from injecting characters that escape subsequent characters.
 * - Decision 2: Reject Unsafe Control Characters: ASCII control and non-printable characters
 *   are hex-escaped to \xXX or rejected to prevent execution engine terminal injection.
 * - Decision 3: Recursive Deep Literal Mapping: Safely maps JavaScript booleans and null/undefined
 *   to True/False/None respectively. Maps arrays to Python lists [...] and objects to Python dicts {...}.
 * - Decision 4: Circular Reference Prevention: Uses a tracking Set to reject objects with circular
 *   references or invalid types to prevent infinite stack overflows.
 */

/**
 * Returns a fully-quoted, safely-escaped Python string literal (enclosed in double quotes).
 *
 * CRITICAL: Escape backslashes FIRST (`\\` -> `\\\\`), then double quotes (`"` -> `\\"`),
 * newlines (`\n` -> `\\n`), carriage returns (`\r` -> `\\r`), tabs (`\t` -> `\\t`), null bytes, etc.
 * Any other ASCII control character is safely hex-escaped via `\\xXX`.
 *
 * @param value Raw string to escape
 * @returns Double-quoted, fully safe Python string literal
 */
export function pyStr(value: string): string {
  // Check if input is a string as a pre-flight safety gate
  if (typeof value !== 'string') {
    throw new Error(`pyStr expects a string, received: ${typeof value}`);
  }

  let result = '"';
  
  // Iterate through character-by-character to avoid regex bypasses and guarantee correctness
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = char.charCodeAt(0);

    // Escape backslash FIRST to prevent escaping subsequent characters
    if (char === '\\') {
      result += '\\\\';
    } else if (char === '"') {
      result += '\\"';
    } else if (char === '\n') {
      result += '\\n';
    } else if (char === '\r') {
      result += '\\r';
    } else if (char === '\t') {
      result += '\\t';
    } else if (code < 32 || code === 127) {
      // Hex-escape any control or unprintable ASCII characters
      const hex = code.toString(16).padStart(2, '0');
      result += `\\x${hex}`;
    } else {
      result += char;
    }
  }

  result += '"';
  return result;
}

/**
 * Recursively serializes arbitrary JS/TS values into valid Python literals.
 * Maps:
 * - booleans -> True/False
 * - null/undefined -> None
 * - strings -> pyStr(...)
 * - arrays -> [...]
 * - plain objects -> {...}
 *
 * Throws on unsupported types, invalid numbers (NaN, Infinity), and circular references.
 *
 * @param value Input value
 * @param seen Set tracking visited objects for circular dependency detection
 * @returns Python literal string representation
 */
export function pyLiteral(value: unknown, seen: Set<unknown> = new Set()): string {
  // 1. Resolve null/undefined -> Python None
  if (value === null || value === undefined) {
    return 'None';
  }

  // 2. Resolve booleans -> True / False
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  // 3. Resolve string -> escaped string literal via pyStr
  if (typeof value === 'string') {
    return pyStr(value);
  }

  // 4. Resolve number -> check finite constraints
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Unsafe non-finite number value received in pyLiteral: ${value}`);
    }
    return value.toString();
  }

  // 5. Resolve BigInt -> standard digit format
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // 6. Throw error on functions or symbols
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`Unsupported callable/reference type received in pyLiteral: ${typeof value}`);
  }

  // 7. Handle complex structures (Objects / Arrays)
  if (typeof value === 'object') {
    // Detect and reject circular references to prevent stack overflow
    if (seen.has(value)) {
      throw new Error('Circular reference detected in pyLiteral');
    }
    seen.add(value);

    try {
      // Map Arrays -> Python list [...]
      if (Array.isArray(value)) {
        const items = value.map((v) => pyLiteral(v, seen));
        return `[${items.join(', ')}]`;
      }

      // Check for plain object strictly
      const objProtoStr = Object.prototype.toString.call(value);
      if (objProtoStr !== '[object Object]') {
        throw new Error(`Unsupported object constructor type in pyLiteral: ${objProtoStr}`);
      }

      // Map plain objects -> Python dict {...} with keys and values properly serialized
      const entries = Object.entries(value).map(([k, v]) => {
        return `${pyStr(k)}: ${pyLiteral(v, seen)}`;
      });
      return `{${entries.join(', ')}}`;
    } finally {
      // Clean up seen tracking set upon unwinding the stack
      seen.delete(value);
    }
  }

  throw new Error(`Unhandled value type in pyLiteral: ${typeof value}`);
}
