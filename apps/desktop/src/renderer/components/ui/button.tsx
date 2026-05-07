import * as React from 'react';

/**
 * Stub Button component — the shadcn/ui Button stripped of Tailwind classes.
 * Will be replaced by @epam/loveship Button in a later migration task (T0.7.9).
 */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: { backgroundColor: '#303240', color: '#fff', border: 'none' },
  destructive: { backgroundColor: '#E54322', color: '#fff', border: 'none' },
  outline: { backgroundColor: 'transparent', color: '#303240', border: '1px solid #E1E3EB' },
  secondary: { backgroundColor: '#F5F6FA', color: '#303240', border: 'none' },
  ghost: { backgroundColor: 'transparent', color: '#303240', border: 'none' },
  link: { backgroundColor: 'transparent', color: '#303240', border: 'none', textDecoration: 'underline' },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  default: { height: '2.25rem', padding: '0.5rem 1rem', fontSize: '0.875rem' },
  sm: { height: '2rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem' },
  lg: { height: '2.5rem', padding: '0.5rem 2rem', fontSize: '0.875rem' },
  icon: { height: '2.25rem', width: '2.25rem', padding: '0' },
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ style, variant = 'default', size = 'default', asChild: _asChild, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      whiteSpace: 'nowrap',
      borderRadius: '0.375rem',
      fontWeight: 500,
      cursor: 'pointer',
      ...variantStyles[variant],
      ...sizeStyles[size],
      ...style,
    };
    return <button ref={ref} style={baseStyle} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button };
