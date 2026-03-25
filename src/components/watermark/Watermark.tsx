import type { PropsWithChildren } from 'react';

interface Props extends PropsWithChildren {
  text: string;
  enabled: boolean;
}

export function Watermark({ text, enabled, children }: Props) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {enabled ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(-30deg, transparent 0, transparent 180px, rgba(0,0,0,0.05) 180px, rgba(0,0,0,0.05) 220px)`,
          }}
        >
          <div style={{ opacity: 0.15, fontSize: 14, transform: 'rotate(-20deg)', margin: '120px' }}>{text}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
