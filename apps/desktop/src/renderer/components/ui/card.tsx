import * as React from 'react';

/**
 * Stub Card components — the shadcn/ui Card stripped of Tailwind classes.
 * Will be replaced by @epam/loveship Panel in a later migration task (T0.7.9).
 */

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div
      ref={ref}
      style={{ borderRadius: '0.75rem', border: '1px solid #E1E3EB', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', ...style }}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '1.5rem', ...style }} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ fontWeight: 600, lineHeight: 1, letterSpacing: '-0.01em', ...style }} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ fontSize: '0.875rem', color: '#6C6F80', ...style }} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ padding: '0 1.5rem 1.5rem', ...style }} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ display: 'flex', alignItems: 'center', padding: '0 1.5rem 1.5rem', ...style }} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
