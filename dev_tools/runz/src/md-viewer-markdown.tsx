import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  type ElementType,
  type ReactNode,
} from 'react';
import type { Components } from 'react-markdown';

import { findMdPathMatches, looksLikeMdPath, resolveMdPath } from './md-viewer-utils';

type CreateMdMarkdownComponentsOptions = {
  baseRelativePath: string;
  knownPaths: ReadonlySet<string>;
  onOpenPath: (path: string) => void;
};

export function linkifyMdPathText(
  text: string,
  onOpen: (path: string) => void,
  baseRelativePath: string,
  knownPaths: ReadonlySet<string>
): ReactNode {
  const matches = findMdPathMatches(text);
  if (matches.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const { value, index } = match;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    const resolved = resolveMdPath(value, baseRelativePath, knownPaths);
    if (resolved && looksLikeMdPath(value)) {
      parts.push(
        <button
          key={`${index}-${value}`}
          type="button"
          className="runz-md-viewer-md-link"
          onClick={() => onOpen(resolved)}
          title={resolved}
        >
          {value}
        </button>
      );
    } else {
      parts.push(value);
    }
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

export function linkifyMdPathChildren(
  children: ReactNode,
  onOpen: (path: string) => void,
  baseRelativePath: string,
  knownPaths: ReadonlySet<string>
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return linkifyMdPathText(child, onOpen, baseRelativePath, knownPaths);
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(child, {
        children: linkifyMdPathChildren(child.props.children, onOpen, baseRelativePath, knownPaths),
      });
    }
    return child;
  });
}

function withLinkifiedChildren(Tag: ElementType, options: CreateMdMarkdownComponentsOptions) {
  return ({ children }: { children?: ReactNode }) =>
    createElement(
      Tag,
      null,
      linkifyMdPathChildren(
        children,
        options.onOpenPath,
        options.baseRelativePath,
        options.knownPaths
      )
    );
}

export function createMdMarkdownComponents(options: CreateMdMarkdownComponentsOptions): Components {
  const { baseRelativePath, knownPaths, onOpenPath } = options;

  return {
    p: withLinkifiedChildren('p', options),
    li: withLinkifiedChildren('li', options),
    td: withLinkifiedChildren('td', options),
    th: withLinkifiedChildren('th', options),
    blockquote: withLinkifiedChildren('blockquote', options),
    em: withLinkifiedChildren('em', options),
    strong: withLinkifiedChildren('strong', options),
    a: ({ href, children }) => {
      if (href && looksLikeMdPath(href)) {
        const resolved = resolveMdPath(href, baseRelativePath, knownPaths);
        if (resolved) {
          return (
            <button
              type="button"
              className="runz-md-viewer-md-link"
              onClick={() => onOpenPath(resolved)}
              title={resolved}
            >
              {children}
            </button>
          );
        }
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    code: ({ className, children, ...props }) => {
      const text = String(children).replace(/\n$/, '');
      const isInline = !className;
      if (isInline && looksLikeMdPath(text)) {
        const resolved = resolveMdPath(text, baseRelativePath, knownPaths);
        if (resolved) {
          return (
            <button
              type="button"
              className="runz-md-viewer-md-link runz-md-viewer-md-link-code"
              onClick={() => onOpenPath(resolved)}
              title={resolved}
            >
              {text}
            </button>
          );
        }
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };
}
