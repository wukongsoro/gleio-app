import React from 'react';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';

interface GalaxyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  monochrome?: boolean;
}

function GalaxyLogo({ size = 'md', className = '', monochrome = false }: GalaxyLogoProps) {
  const theme = useStore(themeStore);
  const isDark = theme === 'dark';
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  // Apple-like monochrome option for homepage dark mode
  const eventHorizonColor = monochrome
    ? (isDark ? 'rgba(0,0,0,1)' : 'rgba(245,245,245,1)')
    : (isDark ? 'rgba(0,0,0,1)' : 'rgba(15,23,42,1)');
  const accretionInner = monochrome
    ? (isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.25)')
    : (isDark ? 'rgba(255,140,0,0.9)' : 'rgba(234,88,12,0.9)');
  const accretionMid = monochrome
    ? (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)')
    : (isDark ? 'rgba(255,69,0,0.8)' : 'rgba(220,38,38,0.8)');
  const accretionOuter = monochrome
    ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')
    : (isDark ? 'rgba(138,43,226,0.6)' : 'rgba(126,34,206,0.6)');
  const jetColor = monochrome
    ? (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)')
    : (isDark ? 'rgba(0,191,255,0.8)' : 'rgba(59,130,246,0.8)');
  const stellarColor = monochrome
    ? (isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)')
    : (isDark ? 'rgba(255,255,255,0.9)' : 'rgba(71,85,105,0.9)');
  const particleColor = monochrome
    ? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
    : (isDark ? 'rgba(255,215,0,0.7)' : 'rgba(251,191,36,0.7)');

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Event Horizon Gradient */}
          <radialGradient id={`eventHorizon-${theme}`} cx="50%" cy="50%" r="15%">
            <stop offset="0%" stopColor={eventHorizonColor} />
            <stop offset="70%" stopColor={eventHorizonColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Accretion Disk Gradient */}
          <radialGradient id={`accretionDisk-${theme}`} cx="50%" cy="50%" r="50%">
            <stop offset="15%" stopColor="transparent" />
            <stop offset="25%" stopColor={accretionInner} />
            <stop offset="40%" stopColor={accretionMid} />
            <stop offset="65%" stopColor={accretionOuter} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Inner Hot Disk */}
          <radialGradient id={`hotDisk-${theme}`} cx="50%" cy="50%" r="25%">
            <stop offset="15%" stopColor="transparent" />
            <stop offset="20%" stopColor={accretionInner} />
            <stop offset="35%" stopColor={accretionMid} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Jet Stream Gradient */}
          <linearGradient id={`jetStream-${theme}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={jetColor} />
            <stop offset="50%" stopColor="rgba(0,191,255,0.4)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Gravitational Lensing Effect */}
          <radialGradient id={`lensing-${theme}`} cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="70%" stopColor="transparent" />
            <stop offset="85%" stopColor={stellarColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Particle Glow Filter */}
          <filter id={`particleGlow-${theme}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Intense Glow for Accretion */}
          <filter id={`accretionGlow-${theme}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Gravitational Lensing Ring */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill={`url(#lensing-${theme})`}
          opacity="0.3"
        />

        {/* Outer Accretion Disk */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="0 50 50;360 50 50"
            dur="20s"
            repeatCount="indefinite"
          />
          
          <ellipse
            cx="50"
            cy="50"
            rx="45"
            ry="12"
            fill={`url(#accretionDisk-${theme})`}
            filter={`url(#accretionGlow-${theme})`}
            opacity="0.7"
          />
        </g>

        {/* Middle Accretion Layer */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="0 50 50;-360 50 50"
            dur="12s"
            repeatCount="indefinite"
          />
          
          <ellipse
            cx="50"
            cy="50"
            rx="32"
            ry="8"
            fill={accretionMid}
            opacity="0.8"
          />
        </g>

        {/* Inner Hot Disk */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="0 50 50;360 50 50"
            dur="8s"
            repeatCount="indefinite"
          />
          
          <ellipse
            cx="50"
            cy="50"
            rx="22"
            ry="6"
            fill={`url(#hotDisk-${theme})`}
            filter={`url(#accretionGlow-${theme})`}
          />
        </g>

        {/* Polar Jets */}
        <g opacity="0.6">
          <ellipse
            cx="50"
            cy="20"
            rx="2"
            ry="15"
            fill={`url(#jetStream-${theme})`}
            filter={`url(#particleGlow-${theme})`}
          >
            <animate
              attributeName="opacity"
              values="0.4;0.8;0.4"
              dur="3s"
              repeatCount="indefinite"
            />
          </ellipse>
          
          <ellipse
            cx="50"
            cy="80"
            rx="2"
            ry="15"
            fill={`url(#jetStream-${theme})`}
            filter={`url(#particleGlow-${theme})`}
          >
            <animate
              attributeName="opacity"
              values="0.4;0.8;0.4"
              dur="3s"
              begin="1.5s"
              repeatCount="indefinite"
            />
          </ellipse>
        </g>

        {/* Particle Streams in Accretion Disk */}
        <g filter={`url(#particleGlow-${theme})`}>
          {/* Particle clusters */}
          <circle cx="72" cy="45" r="1.5" fill={particleColor} opacity="0.8">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;360 50 50"
              dur="15s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.5;1;0.5"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          
          <circle cx="28" cy="55" r="1.2" fill={accretionInner} opacity="0.7">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;360 50 50"
              dur="12s"
              repeatCount="indefinite"
            />
          </circle>
          
          <circle cx="65" cy="52" r="0.8" fill={accretionMid} opacity="0.6">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;360 50 50"
              dur="18s"
              repeatCount="indefinite"
            />
          </circle>
          
          <circle cx="35" cy="48" r="1" fill={particleColor} opacity="0.5">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;360 50 50"
              dur="10s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Smaller particle swarm */}
          <circle cx="58" cy="46" r="0.6" fill={accretionInner} opacity="0.4"/>
          <circle cx="42" cy="54" r="0.5" fill={particleColor} opacity="0.3"/>
          <circle cx="68" cy="49" r="0.4" fill={accretionMid} opacity="0.4"/>
          <circle cx="32" cy="51" r="0.7" fill={accretionOuter} opacity="0.3"/>
        </g>

        {/* Spiral Matter Streams */}
        <g opacity="0.4">
          <path
            d="M 22 50 Q 35 45 50 50 Q 65 55 78 50"
            fill="none"
            stroke={accretionInner}
            strokeWidth="1"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;360 50 50"
              dur="25s"
              repeatCount="indefinite"
            />
          </path>
          
          <path
            d="M 78 50 Q 65 45 50 50 Q 35 55 22 50"
            fill="none"
            stroke={accretionMid}
            strokeWidth="0.8"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50;-360 50 50"
              dur="30s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* Background Stars (gravitationally lensed) */}
        <g opacity="0.6">
          <circle cx="15" cy="20" r="0.8" fill={stellarColor}>
            <animate
              attributeName="opacity"
              values="0.3;0.8;0.3"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="85" cy="25" r="0.6" fill={stellarColor} opacity="0.5"/>
          <circle cx="90" cy="75" r="0.7" fill={stellarColor}>
            <animate
              attributeName="opacity"
              values="0.2;0.7;0.2"
              dur="6s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="10" cy="80" r="0.5" fill={stellarColor} opacity="0.4"/>
          <circle cx="20" cy="15" r="0.4" fill={stellarColor} opacity="0.3"/>
          <circle cx="80" cy="20" r="0.3" fill={stellarColor} opacity="0.5"/>
        </g>

        {/* Event Horizon (Black Hole Center) */}
        <circle
          cx="50"
          cy="50"
          r="12"
          fill={`url(#eventHorizon-${theme})`}
        >
          <animate
            attributeName="r"
            values="12;13;12"
            dur="8s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Photon Sphere Effect */}
        <circle
          cx="50"
          cy="50"
          r="15"
          fill="none"
          stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
          strokeWidth="0.5"
          opacity="0.3"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.1;0.4;0.1"
            dur="5s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}

export default GalaxyLogo;