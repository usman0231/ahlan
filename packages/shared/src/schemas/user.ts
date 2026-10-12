import { z } from 'zod';

import {
  ACCESS_REQUEST_STATUSES,
  ADMIN_SETTABLE_USER_STATUSES,
  ROLES,
  USER_STATUSES,
  requiresStadiumAssignment,
} from '../enums';
import { emailSchema, passwordSchema, phoneSchema } from './auth';
import { cursorQuerySchema, idSchema, optionalText, text, timestampSchema } from './common';

export const localeSchema = z.enum(['en', 'ar']);

export const userSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  organisation: z.string().nullable(),
  jobTitle: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  locale: localeSchema,
  stadiumIds: z.array(idSchema),
  /** Assigned stadiums with display names, sorted by name. Sent by the users endpoints. */
  stadiums: z
    .array(z.object({ id: idSchema, name: z.string(), code: z.string() }))
    .optional(),
  lastLoginAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/** Message shared by every place that enforces "a non-admin needs a stadium". */
export const STADIUM_REQUIRED_MESSAGE = 'Supervisors and inspectors need at least one stadium';

/**
 * Admin-created user: no access request, active immediately.
 * A non-admin must be given at least one stadium.
 */
export const createUserBaseSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: text(120, 2),
  phone: phoneSchema.optional(),
  role: z.enum(ROLES),
  organisation: text(120).optional(),
  jobTitle: text(120).optional(),
  locale: localeSchema.default('en'),
  stadiumIds: z.array(idSchema).max(50).default([]),
});
export const createUserSchema = createUserBaseSchema.superRefine((value, ctx) => {
  if (requiresStadiumAssignment(value.role) && value.stadiumIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stadiumIds'],
      message: STADIUM_REQUIRED_MESSAGE,
    });
  }
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Admin edit of another user. Changing `role` revokes that user's sessions.
 * The API rejects a move to a non-admin role when the user has no stadium.
 */
export const updateUserSchema = z.object({
  fullName: text(120, 2).optional(),
  phone: phoneSchema.optional().nullable(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ADMIN_SETTABLE_USER_STATUSES).optional(),
  organisation: optionalText(120),
  jobTitle: optionalText(120),
  locale: localeSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateProfileSchema = z.object({
  fullName: text(120, 2).optional(),
  phone: phoneSchema.optional().nullable(),
  locale: localeSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Admin sets a user's password (forgotten password, first hand-over).
 * Revokes every session of that user. Self-service uses change-password instead.
 */
export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

/**
 * Replaces the user's stadium assignment wholesale. The API rejects an empty
 * list for a supervisor or inspector.
 */
export const assignStadiumsSchema = z.object({
  stadiumIds: z.array(idSchema).max(50),
});
export type AssignStadiumsInput = z.infer<typeof assignStadiumsSchema>;

export const listUsersQuerySchema = cursorQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  stadiumId: idSchema.optional(),
  search: text(80).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const accessRequestSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  organisation: z.string().nullable(),
  jobTitle: z.string().nullable(),
  note: z.string().nullable(),
  requestedStadiumIds: z.array(idSchema),
  status: z.enum(ACCESS_REQUEST_STATUSES),
  decidedById: idSchema.nullable(),
  decidedAt: timestampSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: timestampSchema,
});
export type AccessRequest = z.infer<typeof accessRequestSchema>;

export const listAccessRequestsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(ACCESS_REQUEST_STATUSES).optional(),
  search: text(80).optional(),
});
export type ListAccessRequestsQuery = z.infer<typeof listAccessRequestsQuerySchema>;

/**
 * Approval is where the admin sets the real role and stadium scope - the
 * applicant's requested stadiums are only a hint.
 */
export const approveAccessRequestSchema = z.object({
  role: z.enum(ROLES).default('INSPECTOR'),
  stadiumIds: z.array(idSchema).max(50),
  note: text(500).optional(),
});
export type ApproveAccessRequestInput = z.infer<typeof approveAccessRequestSchema>;

export const rejectAccessRequestSchema = z.object({
  note: text(500),
});
export type RejectAccessRequestInput = z.infer<typeof rejectAccessRequestSchema>;

export const pendingCountSchema = z.object({ pending: z.number().int().min(0) });
export type PendingCount = z.infer<typeof pendingCountSchema>;
