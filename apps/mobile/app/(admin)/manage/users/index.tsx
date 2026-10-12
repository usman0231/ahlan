import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { ROLES, type Role, type UserStatus } from '@ahlan/shared';

import {
  Avatar,
  Button,
  ChipRow,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  SkeletonList,
  TextField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { ListFooter } from '../../../../src/components/list-footer';
import { UserStatusBadge } from '../../../../src/components/role-badge';
import { Icon } from '../../../../src/components/icon';
import { flatPages, useAllStadiums, useUsers } from '../../../../src/features/admin/hooks';
import { useAuthStore } from '../../../../src/store/auth';
import { usePalette } from '../../../../src/theme/theme-provider';

const STATUSES: UserStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED'];

/** Debounced so typing a name is one request, not one per key. */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Everyone with an account. Search, role and status filter on the server and
 * the list pages by cursor as it scrolls, so a 500-user tournament is as quick
 * as a demo with five.
 */
export default function UsersScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const me = useAuthStore((state) => state.user?.id);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const debounced = useDebounced(search);

  const users = useUsers({ search: debounced, role, status });
  const { data: stadiums } = useAllStadiums();
  const items = flatPages(users.data);

  const stadiumCode = useMemo(() => {
    const map = new Map((stadiums ?? []).map((stadium) => [stadium.id, stadium.code]));
    return (id: string) => map.get(id) ?? '';
  }, [stadiums]);

  const header = (
    <HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage">
      <Button
        label={t('users.new')}
        size="sm"
        fullWidth={false}
        onPress={() => router.push('/(admin)/manage/users/new')}
      />
    </HeaderBar>
  );

  return (
    <Screen headerAction={header} title={t('users.title')} scroll={false}>
      <View className="gap-3 pb-4">
        <View className="px-gutter">
          <TextField
            placeholder={t('users.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('common.search')}
          />
        </View>
        <ChipRow
          options={ROLES.map((value) => ({ value, label: t(`roles.${value}`) }))}
          value={role}
          onChange={(value) => setRole(value as Role | null)}
        />
        <ChipRow
          options={STATUSES.map((value) => ({ value, label: t(`users.statuses.${value}`) }))}
          value={status}
          onChange={(value) => setStatus(value as UserStatus | null)}
        />
      </View>

      <View className="flex-1 px-gutter">
        {users.isError && items.length === 0 ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : users.isLoading ? (
          <SkeletonList count={7} />
        ) : items.length === 0 ? (
          <EmptyState
            title={debounced || role || status ? t('users.noMatch') : t('states.emptyTitle')}
            icon={<Icon name="users" size={40} tone="muted" />}
            actionLabel={t('users.new')}
            onAction={() => router.push('/(admin)/manage/users/new')}
          />
        ) : (
          <FlashList
            data={items}
            keyExtractor={(user) => user.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View className="h-3" />}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (users.hasNextPage && !users.isFetchingNextPage) void users.fetchNextPage();
            }}
            refreshControl={
              <RefreshControl
                refreshing={users.isRefetching && !users.isFetchingNextPage}
                onRefresh={() => void users.refetch()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            ListFooterComponent={
              <ListFooter
                loadingMore={users.isFetchingNextPage}
                hasMore={Boolean(users.hasNextPage)}
                error={users.isFetchNextPageError}
                onRetry={() => void users.fetchNextPage()}
                count={items.length}
              />
            }
            renderItem={({ item, index }) => (
              <ListItem
                index={index}
                leading={<Avatar name={item.fullName} />}
                title={item.id === me ? `${item.fullName} · ${t('users.you')}` : item.fullName}
                subtitle={item.email}
                // Role in the text, not a trailing badge: a long role label as a
                // badge squeezed names into three lines on a 360dp phone.
                meta={[
                  t(`roles.${item.role}`),
                  item.role === 'ADMIN'
                    ? t('users.allStadiums')
                    : item.stadiumIds.length === 0
                      ? t('users.noStadiums')
                      : item.stadiumIds.map(stadiumCode).filter(Boolean).join(' · ') ||
                        t('users.stadiumCount', { count: item.stadiumIds.length }),
                ].join(' · ')}
                trailing={
                  item.status !== 'ACTIVE' ? <UserStatusBadge status={item.status} /> : undefined
                }
                onPress={() =>
                  router.push({ pathname: '/(admin)/manage/users/[id]', params: { id: item.id } })
                }
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}
