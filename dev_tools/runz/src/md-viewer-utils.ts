const MD_PATH_TEXT_PATTERN = /(?:\.\/)?(?:\.\.\/)*(?:[\w.-]+\/)*[\w.-]+\.md/g;

export function splitMdPath(relativePath: string): { dirPath: string; fileName: string } {
  const idx = relativePath.lastIndexOf('/');
  if (idx === -1) {
    return { dirPath: '', fileName: relativePath };
  }
  return {
    dirPath: relativePath.slice(0, idx),
    fileName: relativePath.slice(idx + 1),
  };
}

function normalizeRepoPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^[`"'\[]+|[`"'\]]+$/g, '').trim();
}

export function looksLikeMdPath(value: string): boolean {
  const cleaned = stripWrappingQuotes(value);
  if (!cleaned.endsWith('.md')) {
    return false;
  }
  if (cleaned.includes('://')) {
    return false;
  }
  return /^[\w./_-]+\.md(?:#\[\w.-]+)?$/.test(cleaned);
}

export function resolveMdPath(
  raw: string,
  baseRelativePath: string,
  knownPaths: ReadonlySet<string>
): string | null {
  const cleaned = stripWrappingQuotes(raw.split('#')[0] ?? raw);
  if (!cleaned.endsWith('.md')) {
    return null;
  }

  const direct = normalizeRepoPath(cleaned);
  if (knownPaths.has(direct)) {
    return direct;
  }

  const baseDir = baseRelativePath.includes('/')
    ? baseRelativePath.slice(0, baseRelativePath.lastIndexOf('/'))
    : '';

  let candidate = cleaned;
  if (cleaned.startsWith('./')) {
    candidate = baseDir ? `${baseDir}/${cleaned.slice(2)}` : cleaned.slice(2);
  } else if (cleaned.startsWith('../')) {
    const baseParts = baseDir ? baseDir.split('/') : [];
    let rest = cleaned;
    while (rest.startsWith('../')) {
      baseParts.pop();
      rest = rest.slice(3);
    }
    candidate = [...baseParts, rest].filter(Boolean).join('/');
  } else if (!cleaned.includes('/') && baseDir) {
    candidate = `${baseDir}/${cleaned}`;
  }

  const normalized = normalizeRepoPath(candidate);
  if (knownPaths.has(normalized)) {
    return normalized;
  }

  if (knownPaths.has(cleaned)) {
    return cleaned;
  }

  return normalized.endsWith('.md') ? normalized : null;
}

export function findMdPathMatches(text: string): Array<{ value: string; index: number }> {
  const pattern = new RegExp(MD_PATH_TEXT_PATTERN.source, 'g');
  const matches: Array<{ value: string; index: number }> = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    matches.push({ value, index });
  }
  return matches;
}
