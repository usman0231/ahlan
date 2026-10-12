import type { ChecklistWithVersion } from '@ahlan/shared';

import {
  checklistEditorReducer as reduce,
  draftFromChecklist,
  emptyDraft,
  itemCount,
  metaChanged,
  nextItemCode,
  questionsChanged,
  resetKeys,
  toCreateInput,
  toVersionInput,
  validateDraft,
  type ChecklistDraft,
} from '../checklist-editor';

const STADIUM = '01900000-0000-7000-8000-000000000001';
const DISCIPLINE = '01900000-0000-7000-8000-000000000002';

function filled(): ChecklistDraft {
  let draft = emptyDraft();
  draft = reduce(draft, { type: 'setMeta', field: 'title', value: 'Gate readiness' });
  const section = draft.sections[0]!;
  draft = reduce(draft, {
    type: 'setSectionTitle',
    sectionKey: section.key,
    field: 'title',
    value: 'Gates',
  });
  draft = reduce(draft, {
    type: 'setItemText',
    sectionKey: section.key,
    itemKey: section.items[0]!.key,
    field: 'question',
    value: 'Are gates unobstructed?',
  });
  return draft;
}

beforeEach(() => resetKeys());

describe('checklistEditorReducer', () => {
  it('adds items with the next code in sequence', () => {
    let draft = filled();
    const sectionKey = draft.sections[0]!.key;
    draft = reduce(draft, { type: 'addItem', sectionKey });
    draft = reduce(draft, { type: 'addItem', sectionKey });
    expect(draft.sections[0]!.items.map((item) => item.code)).toEqual(['Q-01', 'Q-02', 'Q-03']);
  });

  it('adds a section that continues the numbering', () => {
    const draft = reduce(filled(), { type: 'addSection' });
    expect(draft.sections).toHaveLength(2);
    expect(draft.sections[1]!.items[0]!.code).toBe('Q-02');
  });

  it('reorders items and sections, ignoring moves past either end', () => {
    let draft = filled();
    const sectionKey = draft.sections[0]!.key;
    draft = reduce(draft, { type: 'addItem', sectionKey });
    const [first, second] = draft.sections[0]!.items;
    draft = reduce(draft, { type: 'moveItem', sectionKey, itemKey: second!.key, direction: -1 });
    expect(draft.sections[0]!.items.map((item) => item.key)).toEqual([second!.key, first!.key]);
    const unchanged = reduce(draft, {
      type: 'moveItem',
      sectionKey,
      itemKey: second!.key,
      direction: -1,
    });
    expect(unchanged.sections[0]!.items.map((item) => item.key)).toEqual([second!.key, first!.key]);

    draft = reduce(draft, { type: 'addSection' });
    const keys = draft.sections.map((section) => section.key);
    draft = reduce(draft, { type: 'moveSection', sectionKey: keys[1]!, direction: -1 });
    expect(draft.sections.map((section) => section.key)).toEqual([keys[1], keys[0]]);
  });

  it('never removes the last section or the last item of a section', () => {
    let draft = filled();
    const section = draft.sections[0]!;
    draft = reduce(draft, { type: 'removeSection', sectionKey: section.key });
    expect(draft.sections).toHaveLength(1);
    draft = reduce(draft, {
      type: 'removeItem',
      sectionKey: section.key,
      itemKey: section.items[0]!.key,
    });
    expect(itemCount(draft)).toBe(1);

    draft = reduce(draft, { type: 'addItem', sectionKey: section.key });
    draft = reduce(draft, {
      type: 'removeItem',
      sectionKey: section.key,
      itemKey: section.items[0]!.key,
    });
    expect(draft.sections[0]!.items.map((item) => item.code)).toEqual(['Q-02']);
  });

  it('upper-cases codes and ties the discipline to the category', () => {
    let draft = filled();
    const section = draft.sections[0]!;
    draft = reduce(draft, {
      type: 'setItemText',
      sectionKey: section.key,
      itemKey: section.items[0]!.key,
      field: 'code',
      value: 'wah-01',
    });
    expect(draft.sections[0]!.items[0]!.code).toBe('WAH-01');

    draft = reduce(draft, { type: 'setDiscipline', disciplineId: DISCIPLINE });
    expect(draft.category).toBe('DISCIPLINE');
    draft = reduce(draft, { type: 'setCategory', category: 'GENERAL' });
    expect(draft.disciplineId).toBeNull();
  });

  it('toggles stadium applicability, empty meaning every stadium', () => {
    let draft = reduce(filled(), { type: 'toggleStadium', stadiumId: STADIUM });
    expect(draft.stadiumIds).toEqual([STADIUM]);
    draft = reduce(draft, { type: 'toggleStadium', stadiumId: STADIUM });
    expect(draft.stadiumIds).toEqual([]);
    draft = reduce(reduce(draft, { type: 'toggleStadium', stadiumId: STADIUM }), {
      type: 'allStadiums',
    });
    expect(draft.stadiumIds).toEqual([]);
  });
});

describe('nextItemCode', () => {
  it('keeps the prefix and padding, and skips codes in use', () => {
    const draft = filled();
    const base = draft.sections[0]!.items[0]!;
    base.code = 'WAH-09';
    expect(nextItemCode(draft)).toBe('WAH-10');

    // Last numbered code is WAH-09, but WAH-10 is already taken above it.
    draft.sections[0]!.items = [
      { ...base, key: 'a', code: 'WAH-10' },
      { ...base, key: 'b', code: 'WAH-09' },
    ];
    expect(nextItemCode(draft)).toBe('WAH-11');
  });

  it('starts at Q-01 when nothing is numbered', () => {
    const draft = filled();
    draft.sections[0]!.items[0]!.code = '';
    expect(nextItemCode(draft)).toBe('Q-01');
  });
});

describe('validateDraft', () => {
  it('passes a complete draft', () => {
    expect(validateDraft(filled())).toEqual({});
  });

  it('points at the exact fields that are wrong', () => {
    let draft = filled();
    const section = draft.sections[0]!;
    draft = reduce(draft, { type: 'addItem', sectionKey: section.key });
    const second = draft.sections[0]!.items[1]!;
    draft = reduce(draft, {
      type: 'setItemText',
      sectionKey: section.key,
      itemKey: second.key,
      field: 'code',
      value: 'Q-01',
    });
    draft = reduce(draft, { type: 'setMeta', field: 'title', value: ' ' });
    draft = reduce(draft, { type: 'setCategory', category: 'DISCIPLINE' });
    draft = reduce(draft, {
      type: 'setSectionTitle',
      sectionKey: section.key,
      field: 'title',
      value: '',
    });

    expect(validateDraft(draft)).toEqual({
      'meta.title': 'titleRequired',
      'meta.discipline': 'disciplineRequired',
      [`section.${section.key}.title`]: 'sectionTitle',
      [`item.${second.key}.code`]: 'codeDuplicate',
      [`item.${second.key}.question`]: 'questionRequired',
    });
  });
});

describe('payloads', () => {
  it('builds a create body the shared schema accepts', () => {
    const result = toCreateInput(filled(), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.publish).toBe(false);
    expect(result.input.sections[0]!.items[0]).toMatchObject({
      code: 'Q-01',
      question: 'Are gates unobstructed?',
      questionAr: null,
      defaultSeverity: 'MEDIUM',
      allowNa: true,
    });
  });

  it('refuses an invalid draft', () => {
    expect(toCreateInput(emptyDraft(), true).ok).toBe(false);
    expect(toVersionInput(emptyDraft(), true).ok).toBe(false);
  });
});

describe('change detection', () => {
  const checklist: ChecklistWithVersion = {
    id: '01900000-0000-7000-8000-0000000000aa',
    title: 'Gate readiness',
    titleAr: null,
    description: null,
    category: 'READINESS',
    disciplineId: null,
    stadiumIds: [STADIUM],
    isActive: true,
    currentVersion: 3,
    currentVersionId: '01900000-0000-7000-8000-0000000000bb',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    version: {
      id: '01900000-0000-7000-8000-0000000000bb',
      checklistId: '01900000-0000-7000-8000-0000000000aa',
      version: 3,
      isPublished: true,
      publishedAt: new Date(),
      createdById: null,
      itemCount: 1,
      createdAt: new Date(),
      sections: [
        {
          id: '01900000-0000-7000-8000-0000000000cc',
          versionId: '01900000-0000-7000-8000-0000000000bb',
          title: 'Gates',
          titleAr: null,
          sortOrder: 0,
          items: [
            {
              id: '01900000-0000-7000-8000-0000000000dd',
              sectionId: '01900000-0000-7000-8000-0000000000cc',
              code: 'Q-01',
              question: 'Are gates unobstructed?',
              questionAr: null,
              guidance: null,
              defaultSeverity: 'HIGH',
              allowNa: false,
              sortOrder: 0,
            },
          ],
        },
      ],
    },
  } as ChecklistWithVersion;

  it('loads the current version and detects what changed', () => {
    const original = draftFromChecklist(checklist);
    expect(original.sections[0]!.items[0]).toMatchObject({
      defaultSeverity: 'HIGH',
      allowNa: false,
    });
    expect(questionsChanged(original, original)).toBe(false);
    expect(metaChanged(original, original)).toBe(false);

    const renamed = reduce(original, { type: 'setMeta', field: 'title', value: 'Gates v2' });
    expect(metaChanged(renamed, original)).toBe(true);
    expect(questionsChanged(renamed, original)).toBe(false);

    const section = original.sections[0]!;
    const reworded = reduce(original, {
      type: 'setItemAllowNa',
      sectionKey: section.key,
      itemKey: section.items[0]!.key,
      allowNa: true,
    });
    expect(questionsChanged(reworded, original)).toBe(true);
    expect(metaChanged(reworded, original)).toBe(false);
  });
});
