import {
  createChecklistSchema,
  createChecklistVersionSchema,
  type ChecklistCategory,
  type ChecklistWithVersion,
  type CreateChecklistInput,
  type CreateChecklistVersionInput,
  type Severity,
  type UpdateChecklistMetaInput,
} from '@ahlan/shared';

/**
 * The checklist editor's state, as a pure reducer plus validation, so the
 * rules (ordering, codes, what counts as a new version) are unit tested
 * without rendering anything.
 *
 * Questions and metadata are separate on purpose: the API versions the
 * questions (any change there is version N+1, and completed inspections keep
 * version N), while title, category, discipline and stadiums are metadata
 * edited in place.
 */

export interface EditorItem {
  /** Local key for React and for error lookup; never sent. */
  key: string;
  code: string;
  question: string;
  questionAr: string;
  guidance: string;
  defaultSeverity: Severity;
  allowNa: boolean;
}

export interface EditorSection {
  key: string;
  title: string;
  titleAr: string;
  items: EditorItem[];
}

export interface ChecklistDraft {
  title: string;
  titleAr: string;
  description: string;
  category: ChecklistCategory;
  disciplineId: string | null;
  /** Empty = applies to every stadium. */
  stadiumIds: string[];
  sections: EditorSection[];
}

export type MetaField = 'title' | 'titleAr' | 'description';
export type ItemField = 'code' | 'question' | 'questionAr' | 'guidance';
export type Direction = -1 | 1;

export type EditorAction =
  | { type: 'load'; draft: ChecklistDraft }
  | { type: 'setMeta'; field: MetaField; value: string }
  | { type: 'setCategory'; category: ChecklistCategory }
  | { type: 'setDiscipline'; disciplineId: string | null }
  | { type: 'toggleStadium'; stadiumId: string }
  | { type: 'allStadiums' }
  | { type: 'addSection' }
  | { type: 'removeSection'; sectionKey: string }
  | { type: 'moveSection'; sectionKey: string; direction: Direction }
  | { type: 'setSectionTitle'; sectionKey: string; field: 'title' | 'titleAr'; value: string }
  | { type: 'addItem'; sectionKey: string }
  | { type: 'removeItem'; sectionKey: string; itemKey: string }
  | { type: 'moveItem'; sectionKey: string; itemKey: string; direction: Direction }
  | { type: 'setItemText'; sectionKey: string; itemKey: string; field: ItemField; value: string }
  | { type: 'setItemSeverity'; sectionKey: string; itemKey: string; severity: Severity }
  | { type: 'setItemAllowNa'; sectionKey: string; itemKey: string; allowNa: boolean };

let keyCounter = 0;
/** Unique within a session; deterministic enough for tests via `resetKeys`. */
export function newKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}
export function resetKeys(): void {
  keyCounter = 0;
}

export function emptyItem(code: string): EditorItem {
  return {
    key: newKey('item'),
    code,
    question: '',
    questionAr: '',
    guidance: '',
    defaultSeverity: 'MEDIUM',
    allowNa: true,
  };
}

export function emptySection(code = 'Q-01'): EditorSection {
  return { key: newKey('section'), title: '', titleAr: '', items: [emptyItem(code)] };
}

export function emptyDraft(): ChecklistDraft {
  return {
    title: '',
    titleAr: '',
    description: '',
    category: 'READINESS',
    disciplineId: null,
    stadiumIds: [],
    sections: [emptySection()],
  };
}

/** The editable copy of a checklist's current version. */
export function draftFromChecklist(checklist: ChecklistWithVersion): ChecklistDraft {
  const sections = [...(checklist.version?.sections ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<EditorSection>((section) => ({
      key: newKey('section'),
      title: section.title,
      titleAr: section.titleAr ?? '',
      items: [...section.items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map<EditorItem>((item) => ({
          key: newKey('item'),
          code: item.code,
          question: item.question,
          questionAr: item.questionAr ?? '',
          guidance: item.guidance ?? '',
          defaultSeverity: item.defaultSeverity,
          allowNa: item.allowNa,
        })),
    }));
  return {
    title: checklist.title,
    titleAr: checklist.titleAr ?? '',
    description: checklist.description ?? '',
    category: checklist.category,
    disciplineId: checklist.disciplineId,
    stadiumIds: [...checklist.stadiumIds],
    sections: sections.length > 0 ? sections : [emptySection()],
  };
}

/**
 * The code for a new item: the last code in the checklist with its trailing
 * number bumped, keeping the prefix and zero padding ("WAH-04" -> "WAH-05").
 * Skips codes already taken.
 */
export function nextItemCode(draft: ChecklistDraft): string {
  const codes = draft.sections.flatMap((section) => section.items.map((item) => item.code.trim()));
  const taken = new Set(codes.map((code) => code.toUpperCase()));
  const last = [...codes].reverse().find((code) => /\d+$/.test(code));
  const match = last ? /^(.*?)(\d+)$/.exec(last) : null;
  const prefix = match?.[1] ?? 'Q-';
  const digits = match?.[2];
  const width = digits ? digits.length : 2;
  let number = digits ? Number(digits) + 1 : 1;
  let candidate = `${prefix}${String(number).padStart(width, '0')}`;
  while (taken.has(candidate.toUpperCase())) {
    number += 1;
    candidate = `${prefix}${String(number).padStart(width, '0')}`;
  }
  return candidate.toUpperCase();
}

function move<T>(list: T[], index: number, direction: Direction): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

function mapSection(
  draft: ChecklistDraft,
  sectionKey: string,
  change: (section: EditorSection) => EditorSection,
): ChecklistDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.key === sectionKey ? change(section) : section,
    ),
  };
}

function mapItem(
  draft: ChecklistDraft,
  sectionKey: string,
  itemKey: string,
  change: (item: EditorItem) => EditorItem,
): ChecklistDraft {
  return mapSection(draft, sectionKey, (section) => ({
    ...section,
    items: section.items.map((item) => (item.key === itemKey ? change(item) : item)),
  }));
}

export function checklistEditorReducer(
  draft: ChecklistDraft,
  action: EditorAction,
): ChecklistDraft {
  switch (action.type) {
    case 'load':
      return action.draft;
    case 'setMeta':
      return { ...draft, [action.field]: action.value };
    case 'setCategory':
      // A discipline belongs to DISCIPLINE checklists only.
      return {
        ...draft,
        category: action.category,
        disciplineId: action.category === 'DISCIPLINE' ? draft.disciplineId : null,
      };
    case 'setDiscipline':
      return {
        ...draft,
        disciplineId: action.disciplineId,
        category: action.disciplineId ? 'DISCIPLINE' : draft.category,
      };
    case 'toggleStadium':
      return {
        ...draft,
        stadiumIds: draft.stadiumIds.includes(action.stadiumId)
          ? draft.stadiumIds.filter((id) => id !== action.stadiumId)
          : [...draft.stadiumIds, action.stadiumId],
      };
    case 'allStadiums':
      return { ...draft, stadiumIds: [] };
    case 'addSection':
      return { ...draft, sections: [...draft.sections, emptySection(nextItemCode(draft))] };
    case 'removeSection':
      // A checklist always keeps one section.
      if (draft.sections.length <= 1) return draft;
      return {
        ...draft,
        sections: draft.sections.filter((section) => section.key !== action.sectionKey),
      };
    case 'moveSection': {
      const index = draft.sections.findIndex((section) => section.key === action.sectionKey);
      return { ...draft, sections: move(draft.sections, index, action.direction) };
    }
    case 'setSectionTitle':
      return mapSection(draft, action.sectionKey, (section) => ({
        ...section,
        [action.field]: action.value,
      }));
    case 'addItem': {
      const code = nextItemCode(draft);
      return mapSection(draft, action.sectionKey, (section) => ({
        ...section,
        items: [...section.items, emptyItem(code)],
      }));
    }
    case 'removeItem':
      return mapSection(draft, action.sectionKey, (section) =>
        // A section always keeps one item.
        section.items.length <= 1
          ? section
          : { ...section, items: section.items.filter((item) => item.key !== action.itemKey) },
      );
    case 'moveItem':
      return mapSection(draft, action.sectionKey, (section) => ({
        ...section,
        items: move(
          section.items,
          section.items.findIndex((item) => item.key === action.itemKey),
          action.direction,
        ),
      }));
    case 'setItemText':
      return mapItem(draft, action.sectionKey, action.itemKey, (item) => ({
        ...item,
        [action.field]: action.field === 'code' ? action.value.toUpperCase() : action.value,
      }));
    case 'setItemSeverity':
      return mapItem(draft, action.sectionKey, action.itemKey, (item) => ({
        ...item,
        defaultSeverity: action.severity,
      }));
    case 'setItemAllowNa':
      return mapItem(draft, action.sectionKey, action.itemKey, (item) => ({
        ...item,
        allowNa: action.allowNa,
      }));
  }
}

/* ------------------------------ serialisation ------------------------------ */

const orNull = (value: string): string | null => (value.trim() ? value.trim() : null);

function sectionsPayload(draft: ChecklistDraft) {
  return draft.sections.map((section) => ({
    title: section.title.trim(),
    titleAr: orNull(section.titleAr),
    items: section.items.map((item) => ({
      code: item.code.trim(),
      question: item.question.trim(),
      questionAr: orNull(item.questionAr),
      guidance: orNull(item.guidance),
      defaultSeverity: item.defaultSeverity,
      allowNa: item.allowNa,
    })),
  }));
}

/** Metadata as `updateChecklistMetaSchema` expects it. */
export function metaPayload(draft: ChecklistDraft): UpdateChecklistMetaInput {
  return {
    title: draft.title.trim(),
    titleAr: orNull(draft.titleAr),
    description: orNull(draft.description),
    category: draft.category,
    disciplineId: draft.category === 'DISCIPLINE' ? draft.disciplineId : null,
    stadiumIds: [...draft.stadiumIds],
  };
}

/**
 * Where a validation problem is, in editor terms: `meta.<field>`,
 * `section.<key>.title`, `item.<key>.<field>`, or `form` (e.g. a duplicate
 * code reported against the item it duplicates).
 */
export type DraftErrors = Record<string, string>;

export type DraftProblem =
  | 'titleRequired'
  | 'sectionTitle'
  | 'codeRequired'
  | 'codeDuplicate'
  | 'questionRequired'
  | 'disciplineRequired'
  | 'tooLong'
  | 'invalid';

/** Error keys (i18n suffixes under `checklists.editor.errors`) per location. */
export function validateDraft(draft: ChecklistDraft): Record<string, DraftProblem> {
  const errors: Record<string, DraftProblem> = {};
  if (draft.title.trim().length < 2) errors['meta.title'] = 'titleRequired';
  if (draft.title.trim().length > 160) errors['meta.title'] = 'tooLong';
  if (draft.category === 'DISCIPLINE' && !draft.disciplineId) {
    errors['meta.discipline'] = 'disciplineRequired';
  }
  const seen = new Set<string>();
  for (const section of draft.sections) {
    const title = section.title.trim();
    if (title.length < 2 || title.length > 160)
      errors[`section.${section.key}.title`] = 'sectionTitle';
    for (const item of section.items) {
      const code = item.code.trim().toUpperCase();
      if (!code || code.length > 16) errors[`item.${item.key}.code`] = 'codeRequired';
      else if (seen.has(code)) errors[`item.${item.key}.code`] = 'codeDuplicate';
      seen.add(code);
      const question = item.question.trim();
      if (question.length < 3) errors[`item.${item.key}.question`] = 'questionRequired';
      else if (question.length > 400) errors[`item.${item.key}.question`] = 'tooLong';
      if (item.guidance.trim().length > 1000) errors[`item.${item.key}.guidance`] = 'tooLong';
      if (item.questionAr.trim().length > 400) errors[`item.${item.key}.questionAr`] = 'tooLong';
    }
  }
  return errors;
}

/** The create body, validated by the shared schema the API uses. */
export function toCreateInput(
  draft: ChecklistDraft,
  publish: boolean,
): { ok: true; input: CreateChecklistInput } | { ok: false } {
  const parsed = createChecklistSchema.safeParse({
    ...metaPayload(draft),
    sections: sectionsPayload(draft),
    publish,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

/** The new-version body (questions only). */
export function toVersionInput(
  draft: ChecklistDraft,
  publish: boolean,
  changeNote?: string,
): { ok: true; input: CreateChecklistVersionInput } | { ok: false } {
  const parsed = createChecklistVersionSchema.safeParse({
    sections: sectionsPayload(draft),
    publish,
    changeNote: changeNote?.trim() || null,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

/** Did the questions change? Only then does saving create a new version. */
export function questionsChanged(draft: ChecklistDraft, original: ChecklistDraft): boolean {
  return JSON.stringify(sectionsPayload(draft)) !== JSON.stringify(sectionsPayload(original));
}

/** Did title, category, discipline or stadiums change? Edited in place. */
export function metaChanged(draft: ChecklistDraft, original: ChecklistDraft): boolean {
  const a = metaPayload(draft);
  const b = metaPayload(original);
  return (
    JSON.stringify({ ...a, stadiumIds: [...(a.stadiumIds ?? [])].sort() }) !==
    JSON.stringify({ ...b, stadiumIds: [...(b.stadiumIds ?? [])].sort() })
  );
}

export function itemCount(draft: ChecklistDraft): number {
  return draft.sections.reduce((total, section) => total + section.items.length, 0);
}
