import { Check, CloudOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import type { SaveStatus } from '../useFormationEditor';

export function EditorHeader({
  back,
  title,
  subtitle,
  status,
  className,
  children,
}: {
  back: string;
  title: string;
  subtitle: string;
  status?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('sep-b flex items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4 lg:px-6 lg:py-4', className)}>
      <Link
        to={back}
        aria-label="Volver a la canción"
        className="size-11 shrink-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] transition-transform hover:scale-105 active:scale-95"
      >
        <ButtonSkin kind="back" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[17px] font-bold leading-tight lg:text-[24px]">{title}</h1>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm text-washi-muted">Formaciones · {subtitle}</p>
          {status}
        </div>
      </div>
      {children}
    </div>
  );
}

export function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] text-[12px] font-bold text-enji-300 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline"
      >
        <CloudOff className="size-3.5" /> Sin guardar · Reintentar
      </button>
    );
  }
  const label = status === 'saving' || status === 'dirty' ? 'Guardando…' : status === 'saved' ? 'Guardado' : null;
  return (
    <span role="status" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-washi-subtle">
      {label === 'Guardado' && <Check className="size-3.5" aria-hidden />}
      {label === 'Guardando…' && <Spinner className="size-3.5" />}
      {label}
    </span>
  );
}
