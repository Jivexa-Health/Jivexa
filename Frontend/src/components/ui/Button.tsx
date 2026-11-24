import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'text';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: 'var(--primary-light)',
          color: 'var(--primary)',
          border: '1px solid rgba(5, 150, 105, 0.25)',
          boxShadow: 'none',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-main)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        };
      case 'ghost':
      case 'text':
        return {
          backgroundColor: 'transparent',
          color: 'var(--primary)',
          border: '1px solid transparent',
          padding: '0 8px',
          height: 'auto',
          minHeight: '36px',
          boxShadow: 'none',
        };
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          border: 'none',
          boxShadow: '0 2px 8px -1px rgba(239, 68, 68, 0.35)',
        };
      case 'primary':
      default:
        return {
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          color: 'white',
          border: 'none',
          boxShadow: '0 2px 8px -1px rgba(5, 150, 105, 0.35)',
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '6px 14px', fontSize: '0.82rem', height: '34px', borderRadius: 'var(--radius-sm)' };
      case 'lg':
        return { padding: '14px 28px', fontSize: '1rem', height: '50px', borderRadius: 'var(--radius-md)' };
      case 'md':
      default:
        return { padding: '10px 20px', fontSize: '0.92rem', height: '42px', borderRadius: 'var(--radius-md)' };
    }
  };

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.65 : 1,
    transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-sans)',
    boxSizing: 'border-box',
    ...getVariantStyles(),
    ...getSizeStyles(),
    ...(style?.backgroundColor && !style?.background ? { background: style.backgroundColor } : {}),
    ...style,
  };

  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || isLoading}
      style={baseStyles}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      ) : (
        children
      )}
    </button>
  );
};
