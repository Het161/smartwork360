'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Right-hand side drawer built on Radix Dialog, so focus trapping, Escape and
 * scroll locking are handled for free (keyboard accessibility is a GIGW
 * requirement, not a nicety).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  const widths = { md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-pop',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            widths[width],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-borderx px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold text-slate-900">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Details panel</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="Close panel">
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <div className="border-t border-borderx bg-slate-50 px-5 py-3">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Centred modal, used for New Task / Add User style forms. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card bg-white shadow-pop',
            sizes[size],
          )}
        >
          <div className="border-b border-borderx px-5 py-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">Dialog</Dialog.Description>
            )}
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-borderx bg-slate-50 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
