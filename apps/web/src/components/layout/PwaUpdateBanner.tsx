import { RiRefreshFill } from '@remixicon/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export function PwaUpdateBanner() {
  const [dismissed, setDismissed] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Vérifie périodiquement les mises à jour sans forcer de rechargement
      setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success(t('pwa.offlineReady'));
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-40 mx-auto flex max-w-lg flex-col gap-3 rounded-lg border border-slate-500 bg-slate-600 p-4 text-slate-50 shadow-lg animate-toast-in sm:left-auto sm:flex-row sm:items-center"
    >
      <div className="flex-1 text-sm">
        <p className="font-bold text-white">{t('pwa.updateTitle')}</p>
        <p className="text-slate-100">{t('pwa.updateDescription')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost" className="text-slate-50 hover:bg-white/10"
          onClick={() => {
            setDismissed(true);
            setNeedRefresh(false);
          }}
        >
          {t('pwa.dismissAction')}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void updateServiceWorker(true);
          }}
        >
          <RiRefreshFill  />
          {t('pwa.updateAction')}
        </Button>
      </div>
    </div>
  );
}
