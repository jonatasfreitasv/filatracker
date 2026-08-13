import { useCallback, useRef, useState } from 'react';

type CopyableValueProps = {
  label: string;
  value: string;
};

export function CopyableValue({ label, value }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <button
      type="button"
      className={`runz-wizard-copyable${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      title={copied ? 'Copied' : `Click to copy ${label}`}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      <code>{value || '—'}</code>
      <span className="runz-wizard-copyable-hint">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}
