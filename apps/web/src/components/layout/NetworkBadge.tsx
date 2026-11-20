import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

export function NetworkBadge() {
  const isOnline = useSessionStore((s) => s.isOnline);

  return (
    <Badge
      variant={isOnline ? 'success' : 'warning'}
      aria-live="polite"
      data-testid="network-badge"
    >
      {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{isOnline ? t('app.online') : t('app.offline')}</span>
    </Badge>
  );
}
