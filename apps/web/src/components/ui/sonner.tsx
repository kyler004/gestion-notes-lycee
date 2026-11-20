import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-sans border border-border shadow-md',
        },
      }}
      {...props}
    />
  );
}
