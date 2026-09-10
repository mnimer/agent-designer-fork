/**
 * fileTypeColors
 *
 * Provides color-coding schemes, badges, and icon indicators for generated source files
 * based on filename and extension (Python, Tests, Terraform/IaC, Docker, Dependencies, Config, Docs, Scripts).
 *
 * Architectural Decisions:
 * 1. Categorizes files into explicit semantic categories with distinct vibrant colors.
 * 2. Returns tailwind text classes, background/border badge classes, and tab active border classes.
 * 3. Supports dot colors and badge labels for rich UI file listings.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export interface FileColorInfo {
  category: 'python' | 'test' | 'terraform' | 'docker' | 'deps' | 'config' | 'docs' | 'script' | 'other';
  badgeLabel: string;
  iconColor: string;
  badgeClass: string;
  tabActiveClass: string;
  dotColor: string;
}

/**
 * Returns color-coding metadata and badge classes for a given filename.
 *
 * @param fileName Name of the file (e.g. agent.py, main.tf, requirements.txt)
 * @returns FileColorInfo with category, badgeLabel, iconColor, badgeClass, tabActiveClass, and dotColor
 * @author Mike Nimer <mikenimer@google.com>
 */
export function getFileColorInfo(fileName: string): FileColorInfo {
  const lower = (fileName || '').toLowerCase();
  const ext = lower.split('.').pop() || '';

  // 1. Test files
  if (lower.startsWith('test_') || lower.endsWith('_test.py') || lower.includes('.test.')) {
    return {
      category: 'test',
      badgeLabel: 'TEST',
      iconColor: 'text-pink-400',
      badgeClass: 'bg-pink-950/60 text-pink-300 border-pink-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-pink-400 font-semibold',
      dotColor: 'bg-pink-400',
    };
  }

  // 2. Terraform / Infrastructure as Code
  if (ext === 'tf' || ext === 'tfvars' || lower.includes('terraform')) {
    return {
      category: 'terraform',
      badgeLabel: 'IAC',
      iconColor: 'text-purple-400',
      badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-purple-400 font-semibold',
      dotColor: 'bg-purple-400',
    };
  }

  // 3. Docker / Containers
  if (lower === 'dockerfile' || lower === '.dockerignore' || ext === 'dockerfile' || lower.includes('docker-compose')) {
    return {
      category: 'docker',
      badgeLabel: 'DOCKER',
      iconColor: 'text-cyan-400',
      badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-cyan-400 font-semibold',
      dotColor: 'bg-cyan-400',
    };
  }

  // 4. Dependencies & environment configs
  if (
    lower === 'requirements.txt' ||
    lower === 'pyproject.toml' ||
    lower === 'pipfile' ||
    lower.startsWith('.env')
  ) {
    return {
      category: 'deps',
      badgeLabel: 'DEPS',
      iconColor: 'text-amber-400',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-amber-400 font-semibold',
      dotColor: 'bg-amber-400',
    };
  }

  // 5. Config files: JSON, YAML, TOML
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return {
      category: 'config',
      badgeLabel: ext.toUpperCase(),
      iconColor: 'text-yellow-400',
      badgeClass: 'bg-yellow-950/60 text-yellow-300 border-yellow-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-yellow-400 font-semibold',
      dotColor: 'bg-yellow-400',
    };
  }

  // 6. Documentation / Markdown
  if (ext === 'md' || lower.startsWith('readme') || ext === 'rst' || ext === 'txt') {
    return {
      category: 'docs',
      badgeLabel: 'DOC',
      iconColor: 'text-blue-400',
      badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-blue-400 font-semibold',
      dotColor: 'bg-blue-400',
    };
  }

  // 7. Shell scripts
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return {
      category: 'script',
      badgeLabel: 'SH',
      iconColor: 'text-emerald-400',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-emerald-400 font-semibold',
      dotColor: 'bg-emerald-400',
    };
  }

  // 8. Python core source files
  if (ext === 'py') {
    return {
      category: 'python',
      badgeLabel: 'PY',
      iconColor: 'text-sky-400',
      badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-500/40',
      tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-sky-400 font-semibold',
      dotColor: 'bg-sky-400',
    };
  }

  return {
    category: 'other',
    badgeLabel: ext ? ext.toUpperCase() : 'FILE',
    iconColor: 'text-gray-400',
    badgeClass: 'bg-[#21262d] text-gray-300 border-[#30363d]',
    tabActiveClass: 'bg-[#0d1117] text-white border-t-2 border-gray-400 font-semibold',
    dotColor: 'bg-gray-400',
  };
}
