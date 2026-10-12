import {
  adminResetPasswordSchema,
  createUserSchema,
  type CreateUserInput,
  type Role,
} from '@ahlan/shared';

/**
 * Validation for the admin user forms.
 *
 * The rules are the shared Zod schemas the API validates with, so the form can
 * never accept something the server will refuse (including "a supervisor or
 * inspector needs at least one stadium", which lives in `createUserSchema`).
 * Messages are mapped to i18n keys here so the screen shows translated text,
 * never the schema's English sentence.
 */

export interface CreateUserFormValues {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  stadiumIds: string[];
  password: string;
}

export type CreateUserField = 'fullName' | 'email' | 'phone' | 'role' | 'stadiumIds' | 'password';

/** i18n keys per field; empty when the form is valid. */
export type FieldErrors<F extends string> = Partial<Record<F, string>>;

const FIELD_KEYS: Record<CreateUserField, string> = {
  fullName: 'users.errors.fullName',
  email: 'users.errors.email',
  phone: 'users.errors.phone',
  role: 'users.errors.role',
  stadiumIds: 'users.errors.stadiumRequired',
  password: 'users.errors.password',
};

export type CreateUserResult =
  { ok: true; data: CreateUserInput } | { ok: false; errors: FieldErrors<CreateUserField> };

export function validateCreateUser(values: CreateUserFormValues): CreateUserResult {
  const parsed = createUserSchema.safeParse({
    fullName: values.fullName,
    email: values.email,
    // An empty phone is "not given", not an invalid number.
    phone: values.phone.trim() ? values.phone : undefined,
    role: values.role,
    // An administrator is never stadium-scoped, so any selection is dropped.
    stadiumIds: values.role === 'ADMIN' ? [] : values.stadiumIds,
    password: values.password,
  });

  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: FieldErrors<CreateUserField> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as CreateUserField | undefined;
    if (field && field in FIELD_KEYS && !errors[field]) errors[field] = FIELD_KEYS[field];
  }
  return { ok: false, errors };
}

export type ResetPasswordResult = { ok: true; newPassword: string } | { ok: false; error: string };

export function validateResetPassword(newPassword: string): ResetPasswordResult {
  const parsed = adminResetPasswordSchema.safeParse({ newPassword });
  return parsed.success
    ? { ok: true, newPassword: parsed.data.newPassword }
    : { ok: false, error: FIELD_KEYS.password };
}

/** A role change to a scoped role must leave the user with a stadium. */
export function validateAccess(role: Role, stadiumIds: string[]): string | null {
  return role !== 'ADMIN' && stadiumIds.length === 0 ? FIELD_KEYS.stadiumIds : null;
}
