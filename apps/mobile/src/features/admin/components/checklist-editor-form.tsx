import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import {
  CHECKLIST_CATEGORIES,
  SEVERITIES,
  type ChecklistCategory,
  type Discipline,
  type Stadium,
} from '@ahlan/shared';

import { Button, IconButton } from '../../../components/button';
import { Card, Section } from '../../../components/card';
import { Chip, SegmentedControl, ToggleRow } from '../../../components/controls';
import { Field, TextField } from '../../../components/input';
import { Text } from '../../../components/text';
import { usePalette } from '../../../theme/theme-provider';
import type {
  ChecklistDraft,
  DraftProblem,
  EditorAction,
  EditorItem,
  EditorSection,
} from '../checklist-editor';

type Dispatch = (action: EditorAction) => void;
type Errors = Record<string, DraftProblem>;

/**
 * The checklist editor: title and targeting, then sections of items. Every
 * change is a reducer action (`checklistEditorReducer`), so the screen only
 * decides what to do with the draft when it is saved.
 */
export function ChecklistEditorForm({
  draft,
  dispatch,
  errors,
  disciplines,
  stadiums,
}: {
  draft: ChecklistDraft;
  dispatch: Dispatch;
  errors: Errors;
  disciplines: Discipline[];
  stadiums: Stadium[];
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const message = (key: string): string | undefined =>
    errors[key] ? t(`checklists.editor.errors.${errors[key]}`) : undefined;

  return (
    <>
      <Section title={t('checklists.editor.details')}>
        <Card className="gap-4">
          <TextField
            label={t('checklists.editor.title')}
            value={draft.title}
            onChangeText={(value) => dispatch({ type: 'setMeta', field: 'title', value })}
            error={message('meta.title')}
          />
          <TextField
            label={t('checklists.editor.titleAr')}
            value={draft.titleAr}
            onChangeText={(value) => dispatch({ type: 'setMeta', field: 'titleAr', value })}
            optional
          />
          <TextField
            label={t('checklists.editor.description')}
            value={draft.description}
            onChangeText={(value) => dispatch({ type: 'setMeta', field: 'description', value })}
            multiline
            optional
          />
          <Field label={t('checklists.editor.category')}>
            <SegmentedControl<ChecklistCategory>
              options={CHECKLIST_CATEGORIES.map((value) => ({
                value,
                label: t(`checklists.editor.categoryShort.${value}`),
              }))}
              value={draft.category}
              onChange={(category) => dispatch({ type: 'setCategory', category })}
            />
          </Field>
          {draft.category === 'DISCIPLINE' ? (
            <Field label={t('checklists.editor.discipline')} error={message('meta.discipline')}>
              <View className="flex-row flex-wrap gap-2">
                {disciplines.map((discipline) => (
                  <Chip
                    key={discipline.id}
                    label={arabic && discipline.nameAr ? discipline.nameAr : discipline.name}
                    selected={draft.disciplineId === discipline.id}
                    onPress={() =>
                      dispatch({
                        type: 'setDiscipline',
                        disciplineId: draft.disciplineId === discipline.id ? null : discipline.id,
                      })
                    }
                  />
                ))}
              </View>
            </Field>
          ) : null}
          <Field label={t('checklists.editor.stadiums')} hint={t('checklists.editor.stadiumsHint')}>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label={t('admin.allStadiums')}
                selected={draft.stadiumIds.length === 0}
                onPress={() => dispatch({ type: 'allStadiums' })}
              />
              {stadiums.map((stadium) => (
                <Chip
                  key={stadium.id}
                  label={stadium.code}
                  selected={draft.stadiumIds.includes(stadium.id)}
                  onPress={() => dispatch({ type: 'toggleStadium', stadiumId: stadium.id })}
                />
              ))}
            </View>
          </Field>
        </Card>
      </Section>

      {draft.sections.map((section, index) => (
        <SectionEditor
          key={section.key}
          section={section}
          index={index}
          count={draft.sections.length}
          dispatch={dispatch}
          message={message}
        />
      ))}

      <Button
        label={t('checklists.editor.addSection')}
        variant="secondary"
        icon={<Plus size={18} color={palette.primary} />}
        onPress={() => dispatch({ type: 'addSection' })}
      />
    </>
  );
}

function SectionEditor({
  section,
  index,
  count,
  dispatch,
  message,
}: {
  section: EditorSection;
  index: number;
  count: number;
  dispatch: Dispatch;
  message: (key: string) => string | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();

  return (
    <Section>
      <Card className="gap-4" style={{ borderStartWidth: 4, borderStartColor: palette.accent }}>
        <View className="flex-row items-center gap-2">
          <Text variant="overline" tone="subtle" className="flex-1">
            {t('checklists.editor.sectionN', { n: index + 1, count })}
          </Text>
          <IconButton
            icon={<ArrowUp size={18} color={palette.fg} />}
            accessibilityLabel={t('checklists.editor.moveSectionUp')}
            disabled={index === 0}
            onPress={() =>
              dispatch({ type: 'moveSection', sectionKey: section.key, direction: -1 })
            }
          />
          <IconButton
            icon={<ArrowDown size={18} color={palette.fg} />}
            accessibilityLabel={t('checklists.editor.moveSectionDown')}
            disabled={index === count - 1}
            onPress={() => dispatch({ type: 'moveSection', sectionKey: section.key, direction: 1 })}
          />
          <IconButton
            icon={<Trash2 size={18} color={palette.danger} />}
            accessibilityLabel={t('checklists.editor.removeSection')}
            disabled={count <= 1}
            onPress={() => dispatch({ type: 'removeSection', sectionKey: section.key })}
          />
        </View>
        <TextField
          label={t('checklists.editor.sectionTitle')}
          value={section.title}
          onChangeText={(value) =>
            dispatch({ type: 'setSectionTitle', sectionKey: section.key, field: 'title', value })
          }
          error={message(`section.${section.key}.title`)}
        />
        <TextField
          label={t('checklists.editor.sectionTitleAr')}
          value={section.titleAr}
          onChangeText={(value) =>
            dispatch({ type: 'setSectionTitle', sectionKey: section.key, field: 'titleAr', value })
          }
          optional
        />

        <View className="gap-3">
          {section.items.map((item, itemIndex) => (
            <ItemEditor
              key={item.key}
              sectionKey={section.key}
              item={item}
              index={itemIndex}
              count={section.items.length}
              dispatch={dispatch}
              message={message}
            />
          ))}
        </View>

        <Button
          label={t('checklists.editor.addItem')}
          variant="ghost"
          icon={<Plus size={18} color={palette.primary} />}
          onPress={() => dispatch({ type: 'addItem', sectionKey: section.key })}
        />
      </Card>
    </Section>
  );
}

function ItemEditor({
  sectionKey,
  item,
  index,
  count,
  dispatch,
  message,
}: {
  sectionKey: string;
  item: EditorItem;
  index: number;
  count: number;
  dispatch: Dispatch;
  message: (key: string) => string | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const text = (field: 'code' | 'question' | 'questionAr' | 'guidance') => (value: string) =>
    dispatch({ type: 'setItemText', sectionKey, itemKey: item.key, field, value });

  return (
    <View className="gap-3 rounded-md border border-border bg-surface-sunken p-3">
      <View className="flex-row items-start gap-2">
        <View style={{ width: 128 }}>
          <TextField
            label={t('checklists.editor.code')}
            value={item.code}
            onChangeText={text('code')}
            autoCapitalize="characters"
            maxLength={16}
            error={message(`item.${item.key}.code`)}
          />
        </View>
        <View className="flex-1" />
        <IconButton
          icon={<ArrowUp size={18} color={palette.fg} />}
          accessibilityLabel={t('checklists.editor.moveItemUp')}
          disabled={index === 0}
          onPress={() =>
            dispatch({ type: 'moveItem', sectionKey, itemKey: item.key, direction: -1 })
          }
        />
        <IconButton
          icon={<ArrowDown size={18} color={palette.fg} />}
          accessibilityLabel={t('checklists.editor.moveItemDown')}
          disabled={index === count - 1}
          onPress={() =>
            dispatch({ type: 'moveItem', sectionKey, itemKey: item.key, direction: 1 })
          }
        />
        <IconButton
          icon={<Trash2 size={18} color={palette.danger} />}
          accessibilityLabel={t('checklists.editor.removeItem')}
          disabled={count <= 1}
          onPress={() => dispatch({ type: 'removeItem', sectionKey, itemKey: item.key })}
        />
      </View>
      <TextField
        label={t('checklists.editor.question')}
        value={item.question}
        onChangeText={text('question')}
        multiline
        error={message(`item.${item.key}.question`)}
      />
      <TextField
        label={t('checklists.editor.questionAr')}
        value={item.questionAr}
        onChangeText={text('questionAr')}
        optional
        error={message(`item.${item.key}.questionAr`)}
      />
      <TextField
        label={t('checklists.editor.guidance')}
        value={item.guidance}
        onChangeText={text('guidance')}
        optional
        error={message(`item.${item.key}.guidance`)}
      />
      <Field
        label={t('checklists.editor.defaultSeverity')}
        hint={t('checklists.editor.severityHint')}
      >
        <View className="flex-row flex-wrap gap-2">
          {SEVERITIES.map((severity) => (
            <Chip
              key={severity}
              label={t(`findings.severities.${severity}`)}
              selected={item.defaultSeverity === severity}
              onPress={() =>
                dispatch({ type: 'setItemSeverity', sectionKey, itemKey: item.key, severity })
              }
            />
          ))}
        </View>
      </Field>
      <View className="-mx-3">
        <ToggleRow
          label={t('checklists.editor.allowNa')}
          description={t('checklists.editor.allowNaHint')}
          value={item.allowNa}
          onChange={(allowNa) =>
            dispatch({ type: 'setItemAllowNa', sectionKey, itemKey: item.key, allowNa })
          }
        />
      </View>
    </View>
  );
}
