/**
 * hashUtils.ts - Fast String Hashing Utilities
 *
 * Purpose:
 * Provides high-performance, non-cryptographic string hashing functions suitable for
 * document state tracking, re-render avoidance, and change detection on the visual canvas.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Uses the 32-bit FNV-1a algorithm to produce high-density, low-collision hashes
 *   with high computational efficiency inside the React main rendering thread.
 */

/**
 * Calculates a fast 32-bit FNV-1a hash of a given string.
 *
 * FNV-1a is ideal for hashing short-to-medium length strings like serialized JSON
 * metadata and configurations, ensuring extremely low collision rates while
 * running in sub-millisecond time.
 *
 * @param str The input string to hash.
 * @returns An 8-character zero-padded hexadecimal string representation of the hash.
 */
export function fnv1a(str: string): string {
  // FNV-1a 32-bit offset basis
  let hash = 0x811c9dc5;

  for (let i = 0; i < str.length; i++) {
    // XOR the bottom with the current character byte
    hash ^= str.charCodeAt(i);
    // Multiply by the 32-bit FNV prime (0x01000193) using Math.imul for true 32-bit integer math
    hash = Math.imul(hash, 0x01000193);
  }

  // Convert to an unsigned 32-bit integer, and format as padded hexadecimal
  return (hash >>> 0).toString(16).padStart(8, '0');
}
