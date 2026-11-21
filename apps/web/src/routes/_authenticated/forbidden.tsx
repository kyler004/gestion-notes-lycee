import { createFileRoute, Link } from '@tanstack/react-router';
import { RiShieldFlashFill } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/forbidden')({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 text-brick-400">
            <RiShieldFlashFill className="size-7" />
            <CardTitle>{t('errors.forbiddenTitle')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('errors.forbiddenDescription')}</p>
          <Button asChild>
            <Link to="/">{t('errors.backHome')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
