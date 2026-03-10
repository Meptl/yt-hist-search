import { useCallback, useEffect, useRef, useState } from 'react';

type YoutubeDataApiKeyFieldProps = {
  id: string;
  value: string;
  loading: boolean;
  saving: boolean;
  statusMessage: string | null;
  statusTone: 'muted' | 'success' | 'error';
  onChange: (next: string) => void;
  compact?: boolean;
};

export function YoutubeDataApiKeyField({
  id,
  value,
  loading,
  saving,
  statusMessage,
  statusTone,
  onChange,
  compact = false
}: YoutubeDataApiKeyFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(value);
  const lastCommittedRef = useRef(value);
  const isDisabled = loading || saving;
  const toggleDisabled = loading || saving;
  const inputType = isVisible ? 'text' : 'password';

  useEffect(() => {
    setDraftValue(value);
    draftValueRef.current = value;
    lastCommittedRef.current = value;
  }, [value]);

  const commitDraft = useCallback(() => {
    const next = draftValueRef.current;
    if (next === lastCommittedRef.current) {
      return;
    }
    lastCommittedRef.current = next;
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    return () => {
      const next = draftValueRef.current;
      if (next !== lastCommittedRef.current) {
        lastCommittedRef.current = next;
        onChange(next);
      }
    };
  }, [onChange]);

  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>YouTube Data API key (optional)</label>
      <p className="status-line">
        By default, we use a public API key which can reach limits or be blocked. Using your own key improves indexing performance by enabling faster metadata lookups.
      </p>
      <div className="input-with-icon">
        <input
          id={id}
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          value={draftValue}
          onChange={(event) => {
            const next = event.target.value;
            setDraftValue(next);
            draftValueRef.current = next;
          }}
          onBlur={commitDraft}
          disabled={isDisabled}
        />
        <button
          type="button"
          className="visibility-toggle"
          onClick={() => setIsVisible((current) => !current)}
          aria-label={isVisible ? 'Hide API key' : 'Show API key'}
          aria-pressed={isVisible}
          disabled={toggleDisabled}
        >
          {isVisible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.4 5.6A10 10 0 0 1 12 5c5.2 0 9.3 4.6 10 6-1 2.2-2.6 4.1-4.7 5.4" />
              <path d="M6.2 6.2C4.3 7.6 2.9 9.2 2 11c.7 1.4 4.8 6 10 6 1 0 1.9-.1 2.8-.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {statusMessage ? (
        <p
          className={`status-line${
            statusTone === 'error'
              ? ' error-line'
              : statusTone === 'success'
                ? ' success-line'
                : ''
          }`}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
