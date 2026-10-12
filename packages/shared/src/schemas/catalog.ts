import { z } from 'zod';

import {
  cursorQuerySchema,
  geoPointSchema,
  idSchema,
  isoDateSchema,
  optionalText,
  text,
  timeZoneSchema,
  timestampSchema,
  queryBooleanSchema,
} from './common';

/* -------------------------------------------------------------------------- */
/* Tournaments                                                                */
/* -------------------------------------------------------------------------- */

export const tournamentSchema = z.object({
  id: idSchema,
  name: z.string(),
  nameAr: z.string().nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  /** Exactly one tournament is active; KPIs and cumulative reports anchor to it. */
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  /** Soft-deleted tournaments are never listed; the active one cannot be deleted. */
  deletedAt: timestampSchema.nullable().optional(),
});
export type Tournament = z.infer<typeof tournamentSchema>;

export const createTournamentSchema = z
  .object({
    name: text(120, 2),
    nameAr: optionalText(120),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    isActive: z.boolean().default(false),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'startDate must not be after endDate',
    path: ['startDate'],
  });
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export const updateTournamentSchema = z.object({
  name: text(120, 2).optional(),
  nameAr: optionalText(120),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;

/* -------------------------------------------------------------------------- */
/* Stadiums                                                                   */
/* -------------------------------------------------------------------------- */

export const stadiumSchema = z.object({
  id: idSchema,
  name: z.string(),
  nameAr: z.string().nullable(),
  code: z.string(),
  city: z.string().nullable(),
  /** Display zone for every timestamp belonging to this stadium. */
  timezone: z.string(),
  capacity: z.number().int().nullable(),
  location: geoPointSchema.nullable(),
  isActive: z.boolean(),
  /** Uploaded photo as a short-lived presigned GET; null = use the bundled photo by code. */
  imageUrl: z.string().url().nullable().optional(),
  imageUpdatedAt: timestampSchema.nullable().optional(),
  deletedAt: timestampSchema.nullable().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Stadium = z.infer<typeof stadiumSchema>;

export const createStadiumSchema = z.object({
  name: text(120, 2),
  nameAr: optionalText(120),
  /** Short uppercase code used on PDFs and in report filenames. */
  code: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]{2,16}$/, 'Use 2-16 uppercase letters, digits or dashes')),
  city: optionalText(80),
  timezone: timeZoneSchema.default('Asia/Riyadh'),
  capacity: z.coerce.number().int().min(0).max(500_000).optional().nullable(),
  location: geoPointSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});
export type CreateStadiumInput = z.infer<typeof createStadiumSchema>;

export const updateStadiumSchema = createStadiumSchema.partial();
export type UpdateStadiumInput = z.infer<typeof updateStadiumSchema>;

export const listStadiumsQuerySchema = cursorQuerySchema.extend({
  search: text(80).optional(),
  isActive: queryBooleanSchema.optional(),
});
export type ListStadiumsQuery = z.infer<typeof listStadiumsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Disciplines                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Disciplines are rows, not a UI enum, so the HSE team can add one without an
 * app release. The seeded set is in `DISCIPLINE_SLUGS`.
 */
export const disciplineSchema = z.object({
  id: idSchema,
  slug: z.string(),
  name: z.string(),
  nameAr: z.string().nullable(),
  /** One-line scope shown on the HSE Observation discipline card. */
  description: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  /** Lucide icon name rendered on the discipline tile. */
  icon: z.string().nullable(),
  /** Theme token key, never a raw hex value. */
  colorToken: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  /** Soft-deleted disciplines are never listed; old records keep resolving them. */
  deletedAt: timestampSchema.nullable().optional(),
});
export type Discipline = z.infer<typeof disciplineSchema>;

export const createDisciplineSchema = z.object({
  slug: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9-]{2,48}$/, 'Use lowercase letters, digits and dashes')),
  name: text(80, 2),
  nameAr: optionalText(80),
  description: optionalText(300),
  descriptionAr: optionalText(300),
  icon: optionalText(48),
  colorToken: optionalText(48),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateDisciplineInput = z.infer<typeof createDisciplineSchema>;

export const updateDisciplineSchema = createDisciplineSchema.partial();
export type UpdateDisciplineInput = z.infer<typeof updateDisciplineSchema>;
