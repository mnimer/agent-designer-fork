/**
 * codeGenerators
 *
 * Visual Agent Flow Builder code generation module.
 * NOTE: All production code generation is handled exclusively by Gemini LLM (`gemini-flash-latest`)
 * via the extension host and prompt catalogs in `resource/prompts/`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { GeneratedFile } from '../../types';

export function generateCodeForGraph(nodes?: any, edges?: any, config?: any): GeneratedFile[] {
  return [];
}
