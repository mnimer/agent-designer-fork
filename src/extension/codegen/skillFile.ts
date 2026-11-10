/**
 * Skill File Parser
 *
 * Purpose: Parses the bundled code generation skill files (`resource/codegen-skills/<name>/SKILL.md`):
 * a YAML-style frontmatter block between `---` lines followed by the markdown body.
 *
 * Supported frontmatter (the only shape our skills use; anything else fails fast):
 * ```yaml
 * ---
 * name: adk-core
 * description: "One sentence."
 * metadata:
 *   usedBy: [generator, reviewer]
 *   targets: [all]
 *   preloadWhen: [mcp]
 * ---
 * ```
 *
 * Architectural decisions / notes for future sessions:
 * - A tiny dedicated parser instead of a YAML dependency: the format is fully controlled by us, the
 *   extension no longer ships `@google/adk` (which provided a parser transitively), and strict parsing
 *   surfaces malformed skills at load time.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

/** A parsed skill file. */
export interface ParsedSkillFile {
  name: string;
  description: string;
  metadata: Record<string, string | string[]>;
  body: string;
}

const FRONTMATTER_DELIMITER = '---';
const TOP_LEVEL_LINE = /^([A-Za-z][\w-]*):\s*(.*)$/;
const METADATA_LINE = /^\s{2,}([A-Za-z][\w-]*):\s*(.*)$/;
const FLOW_LIST = /^\[(.*)\]$/;

/**
 * Parses a scalar or flow-list value (`"quoted"`, `plain`, `[a, b]`).
 *
 * @param raw Raw value text.
 */
function parseValue(raw: string): string | string[] {
  const value = raw.trim();
  const list = FLOW_LIST.exec(value);
  if (list) {
    return list[1]
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter((item) => item.length > 0);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

/**
 * Parses a skill file.
 *
 * @param content File content.
 * @param sourceLabel Label used in error messages (e.g. the file path).
 * @throws Error when the frontmatter is missing or malformed.
 */
export function parseSkillFile(content: string, sourceLabel: string): ParsedSkillFile {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new Error(`${sourceLabel}: skill file must start with a '---' frontmatter block.`);
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER);
  if (end < 0) {
    throw new Error(`${sourceLabel}: frontmatter block is not closed with '---'.`);
  }

  const top: Record<string, string | string[]> = {};
  const metadata: Record<string, string | string[]> = {};
  let inMetadata = false;
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const nested = METADATA_LINE.exec(line);
    if (inMetadata && nested) {
      metadata[nested[1]] = parseValue(nested[2]);
      continue;
    }
    const topMatch = TOP_LEVEL_LINE.exec(line);
    if (!topMatch) {
      throw new Error(`${sourceLabel}: unsupported frontmatter line '${line.trim()}'.`);
    }
    inMetadata = topMatch[1] === 'metadata' && topMatch[2].trim() === '';
    if (!inMetadata) {
      top[topMatch[1]] = parseValue(topMatch[2]);
    }
  }

  const name = top.name;
  const description = top.description;
  if (typeof name !== 'string' || !name) {
    throw new Error(`${sourceLabel}: frontmatter 'name' is required.`);
  }
  if (typeof description !== 'string' || !description) {
    throw new Error(`${sourceLabel}: frontmatter 'description' is required.`);
  }
  return { name, description, metadata, body: lines.slice(end + 1).join('\n').trim() };
}
