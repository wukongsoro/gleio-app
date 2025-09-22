import React from 'react';

type GleioLogoVariant = 'mark' | 'wordmark' | 'horizontal';
type GleioLogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface GleioLogoProps {
  variant?: GleioLogoVariant;
  size?: GleioLogoSize;
  className?: string;
  monochrome?: boolean;
}

const sizeToPx: Record<GleioLogoSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
  xl: 64,
};

function Mark({ size, monochrome, className }: { size: GleioLogoSize; monochrome?: boolean; className?: string }) {
  const px = sizeToPx[size];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={px}
      height={px}
      className={className}
      role="img"
      aria-label="Gleio AI mark"
    >
      <defs>
        <linearGradient id="gleioGradientMark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={monochrome ? 'currentColor' : 'var(--conformity-elements-accent-primary)'} />
          <stop offset="100%" stopColor={monochrome ? 'currentColor' : 'var(--conformity-elements-accent-secondary)'} />
        </linearGradient>
      </defs>
      <path
        fill={monochrome ? 'currentColor' : 'url(#gleioGradientMark)'}
        fillRule="evenodd"
        d="M64 8c30.928 0 56 25.072 56 56s-25.072 56-56 56S8 94.928 8 64 33.072 8 64 8zm0 12C39.043 20 20 39.043 20 64s19.043 44 44 44c22.895 0 41.76-17.51 43.83-39.84H86a6 6 0 0 1 0-12h28.09C111.88 33.833 90.79 20 64 20Z M98 74 L112 70 L112 88 Z"
      />
    </svg>
  );
}

function Wordmark({ size, monochrome, className }: { size: GleioLogoSize; monochrome?: boolean; className?: string }) {
  const px = Math.round(sizeToPx[size] * 4); // scale wordmark width relative to mark
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" width={px} height={sizeToPx[size]} className={className} role="img" aria-label="Gleio AI wordmark">
      <defs>
        <linearGradient id="gleioGradientWordmark" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={monochrome ? 'currentColor' : 'var(--conformity-elements-accent-primary)'} />
          <stop offset="100%" stopColor={monochrome ? 'currentColor' : 'var(--conformity-elements-accent-secondary)'} />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="46"
        fontFamily="SF Pro Display, Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="44"
        fontWeight={700}
        letterSpacing="0.5"
        fill={monochrome ? 'currentColor' : 'url(#gleioGradientWordmark)'}
      >
        Gleio AI
      </text>
    </svg>
  );
}

export default function GleioLogo({ variant = 'mark', size = 'md', className = '', monochrome }: GleioLogoProps) {
  if (variant === 'wordmark') {
    return <Wordmark size={size} className={className} monochrome={monochrome} />;
  }
  if (variant === 'horizontal') {
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Mark size={size} monochrome={monochrome} />
        <Wordmark size={size} monochrome={monochrome} />
      </div>
    );
  }
  return <Mark size={size} className={className} monochrome={monochrome} />;
}


