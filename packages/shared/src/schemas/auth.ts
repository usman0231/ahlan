import { z } from 'zod';

import { ROLES, USER_STATUSES } from '../enums';
import { idSchema, text } from './common';

/** Minimum that keeps the field usable in sunlight on a phone keyboard. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email().max(254));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => /[a-z]/.test(value), { message: 'Must contain a lowercase letter' })
  .refine((value) => /[A-Z]/.test(value), { message: 'Must contain an uppercase letter' })
  .refine((value) => /\d/.test(value), { message: 'Must contain a number' });

export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Must be a valid phone number'));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  deviceId: z.string().max(128).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(16).max(1024),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/**
 * Self-registration. This creates an access request, not a usable account:
 * an admin must approve it before the credentials work.
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: text(120, 2),
  phone: phoneSchema.optional(),
  organisation: text(120).optional(),
  jobTitle: text(120).optional(),
  /** Stadiums the applicant says they will cover; the admin confirms on approval. */
  requestedStadiumIds: z.array(idSchema).max(50).default([]),
  note: text(500).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(512),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const authUserSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  avatarUrl: z.string().url().nullable(),
  locale: z.enum(['en', 'ar']),
  stadiumIds: z.array(idSchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = z.object({
  user: authUserSchema,
  tokens: authTokensSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/** Decoded access-token body. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: (typeof ROLES)[number];
  /** Session id, so a single device can be revoked. */
  sid: string;
  iat?: number;
  exp?: number;
}
