import { Model, Q } from '@nozbe/watermelondb';
import { children, field, lazy, text } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import type { Associations } from '@nozbe/watermelondb/Model';

/**
 * Reference data: pulled from the server, never written on the device.
 *
 * These are what make an inspection possible offline - without the checklist
 * version cached locally there is nothing to answer.
 */

export class StadiumModel extends Model {
  static override table = 'stadiums';

  @text('name') name: string;
  @text('name_ar') nameAr: string | null;
  @text('code') code: string;
  @text('city') city: string | null;
  /** IANA zone; every local date and EOD window for this stadium uses it. */
  @text('timezone') timezone: string;
  @field('latitude') latitude: number | null;
  @field('longitude') longitude: number | null;
  @field('is_active') isActive: boolean;

  /** Localised name, falling back to English when there is no translation. */
  displayName(locale: string): string {
    return locale === 'ar' && this.nameAr ? this.nameAr : this.name;
  }
}

export class DisciplineModel extends Model {
  static override table = 'disciplines';

  @text('slug') slug: string;
  @text('name') name: string;
  @text('name_ar') nameAr: string | null;
  @text('icon') icon: string | null;
  @text('color_token') colorToken: string | null;
  @text('description') description: string | null;
  @text('description_ar') descriptionAr: string | null;
  @field('sort_order') sortOrder: number;
  @field('is_active') isActive: boolean;

  displayName(locale: string): string {
    return locale === 'ar' && this.nameAr ? this.nameAr : this.name;
  }

  displayDescription(locale: string): string | null {
    return locale === 'ar' && this.descriptionAr ? this.descriptionAr : this.description;
  }
}

export class TournamentModel extends Model {
  static override table = 'tournaments';

  @text('name') name: string;
  @text('name_ar') nameAr: string | null;
  @text('start_date') startDate: string;
  @text('end_date') endDate: string;
  @field('is_active') isActive: boolean;
}

export class ChecklistModel extends Model {
  static override table = 'checklists';
  // `@children` and `Q.on` both resolve through this table; without it they
  // throw ("relation that's not has_many") the first time they are touched.
  static override associations: Associations = {
    checklist_versions: { type: 'has_many', foreignKey: 'checklist_id' },
  };

  @text('title') title: string;
  @text('title_ar') titleAr: string | null;
  @text('description') description: string | null;
  @text('discipline_id') disciplineId: string | null;
  /** READINESS | DISCIPLINE | GENERAL; null on rows pulled before schema v2. */
  @text('category') category: string | null;
  @text('current_version_id') currentVersionId: string | null;
  @field('is_active') isActive: boolean;

  @children('checklist_versions') versions: Query<ChecklistVersionModel>;

  /**
   * The published version an inspector answers against.
   *
   * A getter rather than a `@lazy` field: a field initializer would read
   * `currentVersionId` while the class fields are still being set up, which
   * works at runtime through the decorator's accessor but is not something
   * TypeScript can see is safe.
   */
  get currentVersion(): Query<ChecklistVersionModel> {
    return this.collections
      .get<ChecklistVersionModel>('checklist_versions')
      .query(Q.where('id', this.currentVersionId ?? ''));
  }

  displayTitle(locale: string): string {
    return locale === 'ar' && this.titleAr ? this.titleAr : this.title;
  }
}

export class ChecklistVersionModel extends Model {
  static override table = 'checklist_versions';
  static override associations: Associations = {
    checklists: { type: 'belongs_to', key: 'checklist_id' },
    checklist_sections: { type: 'has_many', foreignKey: 'version_id' },
  };

  @text('checklist_id') checklistId: string;
  @field('version') version: number;
  @field('is_published') isPublished: boolean;
  @field('item_count') itemCount: number;

  @children('checklist_sections') sections: Query<ChecklistSectionModel>;

  /** Every item across every section, in display order. */
  @lazy
  items = this.collections
    .get<ChecklistItemModel>('checklist_items')
    .query(
      Q.on('checklist_sections', 'version_id', this.id),
      Q.sortBy('sort_order', Q.asc),
    );
}

export class ChecklistSectionModel extends Model {
  static override table = 'checklist_sections';
  static override associations: Associations = {
    checklist_versions: { type: 'belongs_to', key: 'version_id' },
    checklist_items: { type: 'has_many', foreignKey: 'section_id' },
  };

  @text('version_id') versionId: string;
  @text('title') title: string;
  @text('title_ar') titleAr: string | null;
  @field('sort_order') sortOrder: number;

  @children('checklist_items') items: Query<ChecklistItemModel>;

  displayTitle(locale: string): string {
    return locale === 'ar' && this.titleAr ? this.titleAr : this.title;
  }
}

export class ChecklistItemModel extends Model {
  static override table = 'checklist_items';
  static override associations: Associations = {
    checklist_sections: { type: 'belongs_to', key: 'section_id' },
  };

  @text('section_id') sectionId: string;
  @text('code') code: string;
  @text('question') question: string;
  @text('question_ar') questionAr: string | null;
  @text('guidance') guidance: string | null;
  @text('default_severity') defaultSeverity: string;
  @field('allow_na') allowNa: boolean;
  @field('sort_order') sortOrder: number;

  displayQuestion(locale: string): string {
    return locale === 'ar' && this.questionAr ? this.questionAr : this.question;
  }
}

export class UserModel extends Model {
  static override table = 'users';

  @text('full_name') fullName: string;
  @text('role') role: string;
}
