import type { TreeNode } from "@/types";

const MAP_FILE_THRESHOLD = 8;
const MAX_MAP_LINES = 150;

export function isKeyFile(filename: string): boolean {
  const KEY_PATTERNS = [
    // Entry points
    /^main\.(ts|tsx|js|jsx|py|rs|go)$/,
    /^index\.(ts|tsx|js|jsx)$/,
    /^app\.(ts|tsx|js|jsx|py)$/,
    /^server\.(ts|js)$/,
    // Config files
    /^(next|vite|nuxt|tailwind|tsconfig|jest|vitest)\.config/,
    /^(package|pyproject|cargo|go)(\.(toml|json|mod))?$/i,
    /^\.(env|cursorrules|clinerules)(.example)?$/,
    /^CLAUDE.*\.md$/,
    // Architecture files
    /^(types|constants|config|schema)\.(ts|js|py)$/,
    /^(store|state|context)\.(ts|tsx)$/,
    /^(router|routes|routing)\.(ts|tsx|js)$/,
    /^(middleware|auth|api)\.(ts|tsx|js|py)$/,
  ];
  return KEY_PATTERNS.some(pattern => pattern.test(filename));
}

export function guessFilePurpose(filename: string): string {
  const lower = filename.toLowerCase();
  if (/^main\./i.test(lower))        return 'entry point';
  if (/^index\./i.test(lower))       return 'module index';
  if (/types/i.test(lower))          return 'shared types';
  if (/store|state/i.test(lower))    return 'global state';
  if (/router|routes/i.test(lower))  return 'routing';
  if (/middleware/i.test(lower))     return 'middleware';
  if (/config/i.test(lower))         return 'configuration';
  if (/schema/i.test(lower))         return 'data schema';
  if (/constants/i.test(lower))      return 'constants';
  if (/auth/i.test(lower))           return 'authentication';
  return '';
}

export function buildMapContent(
  tree: TreeNode,
  rootRelativePath: string,
  format: "markdown" | "plaintext"
): string {
  const lines: string[] = [];

  function walkNode(node: TreeNode, depth: number): void {
    if (!node.isDirectory) return;

    const dirFiles = node.children.filter(c => !c.isDirectory);
    const dirFolders = node.children.filter(c => c.isDirectory);

    const normRoot = rootRelativePath.replace(/\\/g, '/');
    const normNode = node.relativePath.replace(/\\/g, '/');

    let relPath = normNode;
    if (normRoot && normNode.startsWith(normRoot)) {
      relPath = normNode.substring(normRoot.length);
      if (relPath.startsWith('/')) {
        relPath = relPath.substring(1);
      }
    }
    if (!relPath) {
      relPath = ".";
    }

    if (format === "markdown") {
      if (depth === 0) {
        lines.push(`\n## Root (${normRoot || '.'}/)`);
      } else {
        lines.push(`\n### ${relPath}/`);
      }
    } else {
      if (depth === 0) {
        lines.push(`\n[Root]`);
      } else {
        lines.push(`\n[${relPath}/]`);
      }
    }

    if (dirFiles.length > MAP_FILE_THRESHOLD) {
      const keyFiles = dirFiles.filter(f => isKeyFile(f.name));
      lines.push(`(${dirFiles.length} files)`);
      keyFiles.forEach(f => {
        const purpose = guessFilePurpose(f.name);
        if (format === "markdown") {
          if (purpose) {
            lines.push(`- \`${f.name}\` — ${purpose}`);
          } else {
            lines.push(`- \`${f.name}\``);
          }
        } else {
          if (purpose) {
            lines.push(`- ${f.name} — ${purpose}`);
          } else {
            lines.push(`- ${f.name}`);
          }
        }
      });
      if (keyFiles.length < dirFiles.length) {
        lines.push(`- ... and ${dirFiles.length - keyFiles.length} more`);
      }
    } else {
      dirFiles.forEach(f => {
        const purpose = guessFilePurpose(f.name);
        if (format === "markdown") {
          if (purpose) {
            lines.push(`- \`${f.name}\` — ${purpose}`);
          } else {
            lines.push(`- \`${f.name}\``);
          }
        } else {
          if (purpose) {
            lines.push(`- ${f.name} — ${purpose}`);
          } else {
            lines.push(`- ${f.name}`);
          }
        }
      });
    }

    dirFolders.forEach(child => walkNode(child, depth + 1));
  }

  walkNode(tree, 0);

  const resultLines = lines.join("\n").trim().split("\n");

  if (resultLines.length > MAX_MAP_LINES) {
    const truncated = resultLines.slice(0, MAX_MAP_LINES);
    truncated.push("");
    if (format === "markdown") {
      truncated.push(`> Map truncated at ${MAX_MAP_LINES} lines.`);
      truncated.push(`> Run Omega again to regenerate with a deeper scan.`);
    } else {
      truncated.push(`Map truncated at ${MAX_MAP_LINES} lines.`);
      truncated.push(`Run Omega again to regenerate with a deeper scan.`);
    }
    return truncated.join("\n");
  }

  return resultLines.join("\n");
}
