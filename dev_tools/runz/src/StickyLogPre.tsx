import { useLayoutEffect, useRef } from 'react';

const PIN_THRESHOLD_PX = 48;

type StickyLogPreProps = {
  className?: string;
  lines: string[];
  emptyPlaceholder?: string;
  /** When a parent panel is shown again (e.g. after display:none), re-pin if stuck. */
  active?: boolean;
};

/**
 * Scrollable log pane that stays pinned to the latest line unless the user
 * scrolls up to read history. Uses useLayoutEffect so the browser's default
 * scroll reset on text replacement does not flash the top of the log.
 */
export function StickyLogPre({
  className,
  lines,
  emptyPlaceholder = '— no log output yet —',
  active = true,
}: StickyLogPreProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const stickToBottomRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const logText = lines.length > 0 ? lines.join('\n') : '';

  useLayoutEffect(() => {
    if (!active) return;
    if (lines.length === 0) {
      stickToBottomRef.current = true;
    }
    const el = preRef.current;
    if (!el || !stickToBottomRef.current) return;

    ignoreScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    // pre-wrap / font metrics can settle one frame later
    const raf = requestAnimationFrame(() => {
      const node = preRef.current;
      if (node && stickToBottomRef.current) {
        node.scrollTop = node.scrollHeight;
      }
      ignoreScrollRef.current = false;
    });
    return () => {
      cancelAnimationFrame(raf);
      ignoreScrollRef.current = false;
    };
  }, [logText, lines.length, active]);

  return (
    <pre
      ref={preRef}
      className={className}
      onScroll={() => {
        if (ignoreScrollRef.current) return;
        const el = preRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current = distance <= PIN_THRESHOLD_PX;
      }}
    >
      {logText || emptyPlaceholder}
    </pre>
  );
}
