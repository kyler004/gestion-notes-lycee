import {
  RiAlertFill,
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiInformationFill,
} from '@remixicon/react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { Spinner } from './spinner';

/**
 * Toasts : carte sombre ardoise, bande colorée à gauche et icône pleine
 * dans une pastille teintée selon le type de message.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      gap={12}
      icons={{
        success: <RiCheckboxCircleFill className="size-5" />,
        error: <RiCloseCircleFill className="size-5" />,
        warning: <RiAlertFill className="size-5" />,
        info: <RiInformationFill className="size-5" />,
        loading: <Spinner className="[&_svg]:size-5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'animate-toast-in group relative flex w-88 max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-lg border border-slate-500 bg-slate-600 py-4 pr-10 pl-5 font-sans text-slate-50 shadow-lg before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-slate-200',
          icon: 'mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-white/10',
          title: 'text-sm font-bold',
          description: 'mt-0.5 text-xs text-slate-100',
          closeButton:
            '!absolute !top-3 !right-3 !left-auto !size-6 !rounded-sm !border-0 !bg-white/10 !text-slate-50 hover:!bg-white/20',
          success: 'before:!bg-emerald-100 [&_[data-icon]]:!bg-emerald-100/20 [&_[data-icon]]:!text-emerald-50',
          error: 'before:!bg-brick-300 [&_[data-icon]]:!bg-brick-300/25 [&_[data-icon]]:!text-brick-100',
          warning: 'before:!bg-amber-300 [&_[data-icon]]:!bg-amber-300/25 [&_[data-icon]]:!text-amber-100',
          info: 'before:!bg-blue-300 [&_[data-icon]]:!bg-blue-300/25 [&_[data-icon]]:!text-blue-100',
        },
      }}
      {...props}
    />
  );
}
