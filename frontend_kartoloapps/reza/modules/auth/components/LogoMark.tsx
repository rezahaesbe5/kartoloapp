import { cn } from '@/shared/lib/cn';

interface LogoMarkProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'gradient' | 'solid' | 'white';
  className?: string;
}

const sizeMap = {
  sm: 'h-9 w-9 text-base',
  md: 'h-12 w-12 text-lg',
  lg: 'h-16 w-16 text-2xl',
};

export function LogoMark({ size = 'md', variant = 'gradient', className }: LogoMarkProps) {
  const base = cn(
    'flex items-center justify-center rounded-2xl font-extrabold shadow-soft',
    sizeMap[size],
    variant === 'gradient' && 'bg-gradient-primary text-white',
    variant === 'solid' && 'bg-primary text-white',
    variant === 'white' && 'bg-white text-primary-700',
    className,
  );
  return (
    <div className={base} aria-hidden="true">
      <span className="-translate-y-px">K</span>
    </div>
  );
}
