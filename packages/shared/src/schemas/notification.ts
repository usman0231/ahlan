import { z } from 'zod';

import { NOTIFICATION_KINDS } from '../enums';
import { cursorQuerySchema, idSchema, queryBooleanSchema, timestampSchema } from './common';

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string(),
  body: z.string(),
  /** Deep link into the app, e.g. "/findings/0193...". */
  route: z.string().nullable(),
  data: z.record(z.string()).nullable(),
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = cursorQuerySchema.extend({
  unreadOnly: queryBooleanSchema.optional(),
  kind: z.enum(NOTIFICATION_KINDS).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const markNotificationsReadSchema = z.object({
  /** Empty marks everything read. */
  ids: z.array(idSchema).max(200).default([]),
});
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

export const registerPushTokenSchema = z.object({
  token: z.string().min(8).max(512),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().max(128),
  appVersion: z.string().max(32).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof unreadCountSchema>;
