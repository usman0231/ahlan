import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from './text';
import { Button } from './button';
import { SkeletonListItem } from './skeleton';

/**
 * Footer for a cursor-paginated list: a skeleton row while the next page
 * loads, a retry when it failed, a quiet end marker when there is no more.
 */
export function ListFooter({
  loadingMore,
  hasMore,
  error,
  onRetry,
  count,
}: {
  loadingMore: boolean;
  hasMore: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Items shown so far; the end marker is skipped for a short list. */
  count: number;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (loadingMore) {
    return (
      <View className="pt-3">
        <SkeletonListItem />
      </View>
    );
  }
  if (error && hasMore && onRetry) {
    return (
      <View className="items-center pt-3">
        <Button label={t('common.retry')} variant="ghost" fullWidth={false} onPress={onRetry} />
      </View>
    );
  }
  if (!hasMore && count > 8) {
    return (
      <View className="items-center py-4">
        <Text variant="caption" tone="subtle">
          {t('admin.endOfList', { count })}
        </Text>
      </View>
    );
  }
  return null;
}
