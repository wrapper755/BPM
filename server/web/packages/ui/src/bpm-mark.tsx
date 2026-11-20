// 생성 파일: design/tokens.json에서 만든다. 직접 고치지 말고 원본을 고친 뒤 scripts/gen_tokens.py (design/bpm-mark.svg·bpm-symbol.svg)

/** BPM 흐름 마크 (스타일 가이드 §6-1, ADR-0118·0163). `label`이 없으면 장식이라 읽지 않는다. */
export function BpmMark({ label, className }: { label?: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 28"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
      <circle cx="8" cy="14" r="5.6" fill="none" stroke="currentColor" strokeWidth="2.8" />
      <line x1="14" y1="14" x2="24" y2="14" stroke="currentColor" strokeWidth="2.8" />
      <rect x="23" y="4" width="26" height="20" rx="5" fill="currentColor" />
      <line x1="48" y1="14" x2="57" y2="14" stroke="currentColor" strokeWidth="2.8" />
      <path d="M66 4.5 L75.5 14 L66 23.5 L56.5 14 Z" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
      <line x1="75" y1="14" x2="82" y2="14" stroke="currentColor" strokeWidth="2.8" />
      <circle cx="88" cy="14" r="5.4" fill="none" stroke="currentColor" strokeWidth="4.4" />
    </svg>
  );
}

/** BPM 정사각 기호 — 마크가 들어갈 폭이 없는 자리에만 (스타일 가이드 §6-1, ADR-0163). `label`이 없으면 장식이라 읽지 않는다. */
export function BpmSymbol({ label, className }: { label?: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
      <rect x="2" y="9" width="15" height="14" rx="4" fill="currentColor" />
      <line x1="17" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="2.6" />
      <path d="M25 10 L31 16 L25 22 L19 16 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}
