'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { cn } from '@/lib/utils';

type Result = { ok: boolean; message?: string } | null;
type Action = (prev: Result, fd: FormData) => Promise<Result>;

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText ?? 'Working…' : children}
    </Button>
  );
}

/**
 * Form bound to a server action with inline success/error feedback.
 * `confirm` shows a browser confirmation dialog before submitting.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
  inlineMessage,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  inlineMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.message && (
        <p
          role="status"
          className={cn(
            'flex items-start gap-1.5 text-sm',
            inlineMessage ? 'mt-1' : 'mt-3 rounded-lg px-3 py-2',
            state.ok ? 'text-green-800' : 'text-red-700',
            !inlineMessage && (state.ok ? 'bg-green-50' : 'bg-red-50')
          )}
        >
          {state.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}
