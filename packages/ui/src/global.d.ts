// Ambient type declarations for assets imported within @agent-profiler/ui

// SVG files imported as React components (Vite + @svgr/rollup asset handling)
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
