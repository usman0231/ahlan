/**
 * Demo data for local development.
 *
 * Everything here is invented. Never put a real person's name, email, phone
 * number or photo in a seed - this file ends up in version control and on every
 * developer's machine. (Stadium names are public venues, not people.)
 *
 * RE-RUNNABLE: the seed first TRUNCATES every application table (everything
 * except `_prisma_migrations`) and then recreates the demo data. Never point it
 * at a database whose data you want to keep.
 *
 * Seeded logins (password is the same for all of them: `Stadium2026!`):
 *
 *   admin@ahlan.local        HSE Administrator, sees everything
 *   supervisor@ahlan.local   Supervisor - reviews KFS, KSU, KDA, IMU
 *   inspector1@ahlan.local   Venue Inspector - KAS King Abdullah Sports City (Jeddah)
 *   inspector2@ahlan.local   Venue Inspector - PAF Prince Abdullah Al-Faisal Sports City (Jeddah)
 *   inspector3@ahlan.local   Venue Inspector - ARM Aramco Stadium (Al Khobar)
 *   inspector4@ahlan.local   Venue Inspector - KFS King Fahd Sports City Stadium (Riyadh)
 *   inspector5@ahlan.local   Venue Inspector - KSU King Saud University Stadium (Riyadh)
 *   inspector6@ahlan.local   Venue Inspector - KDA Kingdom Arena (Riyadh)
 *   inspector7@ahlan.local   Venue Inspector - IMU Imam Mohammed Ibn Saud University Stadium (Riyadh)
 *   inspector8@ahlan.local   Venue Inspector - SHB Al Shabab Stadium (Riyadh)
 *   pending@ahlan.local      has a PENDING access request, cannot sign in yet
 *
 * Checklists: the six sheets of the Stadium Safety Readiness Checklist
 * (251001-FR34SCL-HSE-V01, category READINESS, item text verbatim) plus one
 * DISCIPLINE checklist per HSE observation discipline.
 *
 * EOD: one global recurring window default, 18:00-23:00 enabled, and no
 * per-date windows, so whatever the admin sets is what takes effect.
 *
 * Run with: pnpm --filter api db:seed
 */

import { PrismaClient, type Severity } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  DISCIPLINE_SLUGS,
  EOD_DEFAULT_WORKFORCE_CATEGORIES,
  addDays,
  compliancePercent,
  eodWorkforceTotals,
  tallyResponses,
  uuidv7,
  workforceManHours,
  zonedDateString,
  type ObservationType,
  type ResponseValue,
} from '@ahlan/shared';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Stadium2026!';
const TIMEZONE = 'Asia/Riyadh';
/** Riyadh is UTC+3 all year: local HH:mm -> UTC instant on a date. */
const UTC_OFFSET_HOURS = 3;
const HISTORY_DAYS = 14;

/** Deterministic pseudo-random, so a reseed produces the same demo numbers. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
const random = makeRandom(20261012);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function between(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** A stadium-local wall-clock time on a date, as a UTC instant. */
function localInstant(date: string, hour: number, minute = 0): Date {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCHours(hour - UTC_OFFSET_HOURS, minute, 0, 0);
  return instant;
}

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */

const STADIUMS = [
  { code: 'KAS', name: 'King Abdullah Sports City', nameAr: 'مدينة الملك عبدالله الرياضية', city: 'Jeddah', capacity: 62_345, lat: 21.7638, lng: 39.1622 },
  { code: 'PAF', name: 'Prince Abdullah Al-Faisal Sports City', nameAr: 'مدينة الأمير عبدالله الفيصل الرياضية', city: 'Jeddah', capacity: 27_000, lat: 21.5175, lng: 39.2203 },
  { code: 'ARM', name: 'Aramco Stadium', nameAr: 'ملعب أرامكو', city: 'Al Khobar', capacity: 46_000, lat: 26.2361, lng: 50.1647 },
  { code: 'KFS', name: 'King Fahd Sports City Stadium', nameAr: 'استاد مدينة الملك فهد الرياضية', city: 'Riyadh', capacity: 68_752, lat: 24.7889, lng: 46.8397 },
  { code: 'KSU', name: 'King Saud University Stadium', nameAr: 'ملعب جامعة الملك سعود', city: 'Riyadh', capacity: 25_000, lat: 24.7136, lng: 46.6191 },
  { code: 'KDA', name: 'Kingdom Arena', nameAr: 'المملكة أرينا', city: 'Riyadh', capacity: 26_000, lat: 24.7571, lng: 46.6408 },
  { code: 'IMU', name: 'Imam Mohammed Ibn Saud University Stadium', nameAr: 'ملعب جامعة الإمام محمد بن سعود الإسلامية', city: 'Riyadh', capacity: 15_000, lat: 24.816, lng: 46.709 },
  { code: 'SHB', name: 'Al Shabab Stadium', nameAr: 'ملعب نادي الشباب', city: 'Riyadh', capacity: 15_000, lat: 24.689, lng: 46.766 },
] as const;

/** Invented people, one inspector per stadium in the order above. */
const INSPECTOR_NAMES = [
  'Omar Haddad',
  'Lina Saeed',
  'Yousef Qasim',
  'Reem Nasser',
  'Tariq Mansour',
  'Huda Karim',
  'Sami Aziz',
  'Noor Fahad',
] as const;

const SUPERVISOR_STADIUMS = ['KFS', 'KSU', 'KDA', 'IMU'] as const;

const DISCIPLINES: {
  slug: (typeof DISCIPLINE_SLUGS)[number];
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  colorToken: string;
}[] = [
  {
    slug: 'work-at-height',
    name: 'Work at Height',
    nameAr: 'العمل على ارتفاع',
    description: 'Fall prevention, access equipment, scaffolds and work platforms.',
    descriptionAr: 'منع السقوط ومعدات الوصول والسقالات ومنصات العمل.',
    icon: 'hard-hat',
    colorToken: 'discipline.height',
  },
  {
    slug: 'electrical-safety',
    name: 'Electrical Safety',
    nameAr: 'السلامة الكهربائية',
    description: 'Electrical installations, cables, distribution and safe use of equipment.',
    descriptionAr: 'التمديدات الكهربائية والكابلات والتوزيع والاستخدام الآمن للمعدات.',
    icon: 'zap',
    colorToken: 'discipline.electrical',
  },
  {
    slug: 'excavation',
    name: 'Excavation',
    nameAr: 'الحفريات',
    description: 'Excavations, trenches, access, barriers and ground conditions.',
    descriptionAr: 'الحفريات والخنادق والوصول والحواجز وظروف التربة.',
    icon: 'construction',
    colorToken: 'discipline.excavation',
  },
  {
    slug: 'power-infrastructure',
    name: 'Power Infrastructure',
    nameAr: 'البنية التحتية للطاقة',
    description: 'Generators, temporary power, distribution systems and associated controls.',
    descriptionAr: 'المولدات والطاقة المؤقتة وأنظمة التوزيع وأدوات التحكم المرتبطة بها.',
    icon: 'power',
    colorToken: 'discipline.power',
  },
  {
    slug: 'overlay-temporary-infrastructure',
    name: 'Overlay / Temporary Infrastructure',
    nameAr: 'الإنشاءات المؤقتة',
    description: 'Temporary structures, installations, stability and safe access.',
    descriptionAr: 'الهياكل المؤقتة والتركيبات والثبات والوصول الآمن.',
    icon: 'layout-panel-left',
    colorToken: 'discipline.overlay',
  },
  {
    slug: 'housekeeping',
    name: 'Housekeeping',
    nameAr: 'النظافة والترتيب',
    description: 'Work areas, access routes, waste, materials and trip hazards.',
    descriptionAr: 'مناطق العمل وممرات الوصول والنفايات والمواد ومخاطر التعثر.',
    icon: 'sparkles',
    colorToken: 'discipline.housekeeping',
  },
];

/**
 * Stadium Safety Readiness Checklist (251001-FR34SCL-HSE-V01). Item text is
 * verbatim from the client's workbook; the Outer Perimeter sheet repeats its
 * last item five times (rows 12-16), which is kept once.
 */
const READINESS: { code: string; title: string; titleAr: string; items: string[] }[] = [
  {
    code: 'OP',
    title: 'Outer Perimeter',
    titleAr: 'المحيط الخارجي',
    items: [
      'Identification of gates are available',
      'Are the gates stable and well-supported',
      'Are gates free of trip and fall hazards',
      'Do the edge of gate have anti slip finish',
      'Is adequate lighting available for gate',
      'Electrical cables are arranged properly',
      'Are the gate free from debris or storage',
      'Are area under and surrounding the gate free of storage',
      'Are the gate surrounding has necessary signages',
      'Counterweight of the fences are stable',
      'Emergency exit gates are clearly marked',
      'Are the pedestrian access will not be disturb with vehicle movement',
    ],
  },
  {
    code: 'PSA',
    title: 'PSA Safety',
    titleAr: 'سلامة مناطق الوصول الأمني العام (PSA)',
    items: [
      'Are PSA identification and direction signs in place and legible?',
      'Is the PSA structure visibly stable, well-supported and free from damage?',
      'Is access to the PSA free from trip and fall hazards?',
      'Are PSA egress routes clear and free from trip and fall hazards?',
      'Are PSA walking surfaces and thresholds slip-resistant?',
      'Is adequate lighting available in the PSA?',
      'Are screening and queue barriers secure and arranged without blocking access or escape routes?',
      'Are the PSAs free from debris or storage?',
      'Are the areas under and around the PSAs free from unnecessary storage?',
      'Are electrical cables secured and protected, without exposed damage or trip hazards?',
      'Are accessible surfaces and edges free from sharp projections?',
      'Are garbage bins properly maintained?',
      'Are designated accessible screening lanes and their approach routes clear and usable?',
      'Where fitted, can designated emergency exit gates be opened readily, with release devices unobstructed?',
      'Are required extinguishers and hose reels in place, accessible, visibly undamaged and within their indicated inspection/service period?',
    ],
  },
  {
    code: 'IP',
    title: 'Inner Perimeter',
    titleAr: 'المحيط الداخلي',
    items: [
      'Are generators and distribution boards secured, with covers closed, ventilation clear and no visible damage or fuel leakage?',
      'Are designated smoking areas free from combustible materials?',
      'Are the surrounding areas free from trip and fall hazards?',
      'Are drain covers in place, secure and free from hazardous gaps or changes in level?',
      'Are fan-zone cables secured and protected without obstructing pedestrian routes?',
      'Are garbage bins available in the required locations?',
      'Are the surrounding areas free from unnecessary storage?',
      'Are required direction and safety signs in place and legible?',
      'Is adequate lighting available in the area?',
      'Are media cables secured and protected without creating trip hazards?',
      'Are toilets usable, with safe access, secure fittings and floors free from slip or trip hazards?',
      'Are required extinguishers and hose reels in place, accessible, visibly undamaged and within their indicated inspection/service period?',
      'Where cooking is provided, are heat sources clear of combustibles and gas cylinders or fuel containers secured in their designated locations?',
      'Are temporary tents, platforms, signs and other installations visibly secure and free from damage?',
      'Are fire hydrants and fire-service connections unobstructed, where provided?',
      'Are emergency vehicle routes and access points within the inner perimeter clear?',
    ],
  },
  {
    code: 'IS',
    title: 'Inside Stadium',
    titleAr: 'داخل الملعب',
    items: [
      'Are pitch-area cables secured and protected without obstructing access or creating trip hazards?',
      'Are media cables in seating areas secured without obstructing seats or aisles?',
      'Are generators, distribution boards and backup-power equipment secured, with covers closed and no obvious damage?',
      'Are required extinguishers and hose reels in place, accessible, visibly undamaged and within their indicated inspection/service period?',
      'Are required exit, direction and safety signs in place, visible and legible?',
      'Is the area free from unnecessary storage of combustible, flammable or other materials?',
      'Are circulation routes, aisles and exit routes free from obstruction?',
      'Are accessible seating spaces and companion seats clear and free from hazards?',
      'Are accessible toilets usable, with clear access and secure fittings?',
      'Are media cables elsewhere inside the building secured and protected without creating trip hazards?',
      'Is adequate lighting available in all occupied areas and circulation routes?',
      'Are spectator seats secure and free from broken parts or sharp edges?',
      'Are balustrades, guards and spectator barriers complete, secure and free from visible damage?',
      'Are fire doors undamaged, free from improper wedges and able to close and latch as intended?',
      'Are accessible paths, ramps, exit routes and designated refuge spaces, where provided, clear and usable?',
      'Are designated first-aid rooms identifiable, accessible and free from unrelated storage?',
      'Are temporary platforms, signs and overhead fixtures visibly secure and free from obvious damage?',
      'Are fire alarm call points, hose cabinets and fire-service access points visible and unobstructed?',
    ],
  },
  {
    code: 'ST',
    title: 'Staircase',
    titleAr: 'السلالم',
    items: [
      'Are stair identification and exit signs in place and legible?',
      'Are stairs and landings visibly stable, supported and free from damaged or missing treads?',
      'Are stairs free from trip and fall hazards?',
      'Are stair nosings and anti-slip finishes intact?',
      'Is adequate lighting available on the stairs and landings?',
      'Is emergency lighting available on the stairs and landings?',
      'Are stairs and landings free from debris, storage and other obstructions?',
      'Are the areas under and around the stairs free from unnecessary storage?',
      'Are stair landings clear, with doors opening freely without creating a hazard at the steps?',
      'Are required handrails and guards present, secure and free from damage?',
      'Can emergency announcements be heard clearly in the stair area?',
      'Where provided, are stair smoke-control or pressurisation systems confirmed available for operation?',
      'Are stair-enclosure fire doors undamaged, free from improper wedges and able to close and latch?',
    ],
  },
  {
    code: 'PM',
    title: 'Prematch',
    titleAr: 'ما قبل المباراة',
    items: [
      'Are critical assets secured and the required backup power confirmed available by the responsible operator?',
      "Where a firefighters' lift is provided, are its access keys available to the designated responsible person?",
      'Has the responsible operator confirmed that the fire alarm system is available in the approved event configuration?',
      'Are the radios ready to use?',
      'Are volunteers briefed and deployed?',
      'Are all access points free from trip, slip and fall hazards?',
      'Have hospitality and protocol staff received their safety briefing and induction?',
      'Have the Venue Commander and VOC members received their safety briefing and induction?',
      'Has the PA system been tested and confirmed operational?',
      'Has emergency lighting been checked and confirmed operational?',
      'Are emergency exits and access routes clear, with designated exit doors and gates unlocked and ready for use?',
      'Are identified defects from the safety readiness inspection closed or escalated before opening?',
      'Are required CCTV, turnstile/counting and entry-control systems confirmed ready by their responsible operators?',
    ],
  },
];

/** Severity pre-filled on a NO, by what the item is about. */
function readinessSeverity(question: string): Severity {
  if (/fire|extinguisher|hydrant|emergency exit|escape/i.test(question)) return 'CRITICAL';
  if (/electrical|cable|generator|distribution|power|barrier|balustrade|handrail|stable|structure|emergency|gas/i.test(question)) {
    return 'HIGH';
  }
  if (/sign|lighting|trip|slip/i.test(question)) return 'MEDIUM';
  return 'LOW';
}

const DISCIPLINE_CHECKLISTS: {
  title: string;
  titleAr: string;
  slug: (typeof DISCIPLINE_SLUGS)[number];
  sections: { title: string; items: { code: string; question: string; severity: Severity }[] }[];
}[] = [
  {
    title: 'Work at Height Inspection',
    titleAr: 'تفتيش العمل على ارتفاع',
    slug: 'work-at-height',
    sections: [
      {
        title: 'Access and egress',
        items: [
          { code: 'WAH-01', question: 'Are ladders secured and at the correct angle?', severity: 'HIGH' },
          { code: 'WAH-02', question: 'Is scaffold access via an internal stair or ladder tower?', severity: 'MEDIUM' },
          { code: 'WAH-03', question: 'Is the scaffold tagged and within its inspection date?', severity: 'CRITICAL' },
        ],
      },
      {
        title: 'Edge protection',
        items: [
          { code: 'WAH-04', question: 'Are guardrails fitted to all open edges?', severity: 'CRITICAL' },
          { code: 'WAH-05', question: 'Are toe boards in place on working platforms?', severity: 'HIGH' },
          { code: 'WAH-06', question: 'Is the area below the works barricaded?', severity: 'HIGH' },
        ],
      },
      {
        title: 'Personal protection',
        items: [
          { code: 'WAH-07', question: 'Are full-body harnesses worn and clipped on?', severity: 'CRITICAL' },
          { code: 'WAH-08', question: 'Are anchor points rated and documented?', severity: 'HIGH' },
        ],
      },
    ],
  },
  {
    title: 'Electrical Safety Inspection',
    titleAr: 'تفتيش السلامة الكهربائية',
    slug: 'electrical-safety',
    sections: [
      {
        title: 'Distribution and cabling',
        items: [
          { code: 'ELE-01', question: 'Are distribution boards locked and labelled?', severity: 'HIGH' },
          { code: 'ELE-02', question: 'Are all cables free of damage and off walkways?', severity: 'HIGH' },
          { code: 'ELE-03', question: 'Is RCD protection fitted and tested?', severity: 'CRITICAL' },
        ],
      },
      {
        title: 'Isolation',
        items: [
          { code: 'ELE-04', question: 'Is lock-out / tag-out applied to isolated circuits?', severity: 'CRITICAL' },
          { code: 'ELE-05', question: 'Are permits to work in place for live works?', severity: 'CRITICAL' },
        ],
      },
    ],
  },
  {
    title: 'Excavation Inspection',
    titleAr: 'تفتيش الحفريات',
    slug: 'excavation',
    sections: [
      {
        title: 'Ground and support',
        items: [
          { code: 'EXC-01', question: 'Is a valid excavation permit and services drawing available?', severity: 'CRITICAL' },
          { code: 'EXC-02', question: 'Are trench sides shored, battered or stepped as required?', severity: 'CRITICAL' },
          { code: 'EXC-03', question: 'Are spoil heaps and materials kept back from the edge?', severity: 'HIGH' },
        ],
      },
      {
        title: 'Access and barriers',
        items: [
          { code: 'EXC-04', question: 'Is safe access and egress provided by ladder or ramp?', severity: 'HIGH' },
          { code: 'EXC-05', question: 'Are hard barriers and signage in place around the excavation?', severity: 'HIGH' },
          { code: 'EXC-06', question: 'Is the excavation inspected at the start of each shift?', severity: 'MEDIUM' },
        ],
      },
    ],
  },
  {
    title: 'Power Infrastructure Inspection',
    titleAr: 'تفتيش البنية التحتية للطاقة',
    slug: 'power-infrastructure',
    sections: [
      {
        title: 'Generators',
        items: [
          { code: 'PWR-01', question: 'Are generators earthed, bunded and fenced off from the public?', severity: 'CRITICAL' },
          { code: 'PWR-02', question: 'Is refuelling done with the generator off and a spill kit on hand?', severity: 'HIGH' },
          { code: 'PWR-03', question: 'Is a fire extinguisher of the correct type next to each generator?', severity: 'HIGH' },
        ],
      },
      {
        title: 'Temporary distribution',
        items: [
          { code: 'PWR-04', question: 'Are temporary distribution units weatherproof and locked?', severity: 'HIGH' },
          { code: 'PWR-05', question: 'Are load schedules and isolation points documented on site?', severity: 'MEDIUM' },
        ],
      },
    ],
  },
  {
    title: 'Overlay / Temporary Infrastructure Inspection',
    titleAr: 'تفتيش الإنشاءات المؤقتة',
    slug: 'overlay-temporary-infrastructure',
    sections: [
      {
        title: 'Temporary structures',
        items: [
          { code: 'OVL-01', question: 'Are temporary structures certified by an engineer?', severity: 'CRITICAL' },
          { code: 'OVL-02', question: 'Is ballast or anchorage adequate for wind load?', severity: 'HIGH' },
          { code: 'OVL-03', question: 'Are spectator barriers secure and crush-tested?', severity: 'CRITICAL' },
        ],
      },
      {
        title: 'Crowd flow',
        items: [
          { code: 'OVL-04', question: 'Are signage and wayfinding in place?', severity: 'MEDIUM' },
          { code: 'OVL-05', question: 'Are trip hazards on spectator routes eliminated?', severity: 'HIGH' },
        ],
      },
    ],
  },
  {
    title: 'Housekeeping Inspection',
    titleAr: 'تفتيش النظافة والترتيب',
    slug: 'housekeeping',
    sections: [
      {
        title: 'Access routes',
        items: [
          { code: 'HK-01', question: 'Are walkways and stairs clear of materials?', severity: 'MEDIUM' },
          { code: 'HK-02', question: 'Are emergency exits unobstructed?', severity: 'CRITICAL' },
          { code: 'HK-03', question: 'Is lighting adequate in work areas?', severity: 'MEDIUM' },
        ],
      },
      {
        title: 'Waste',
        items: [
          { code: 'HK-04', question: 'Are waste skips segregated and not overfilled?', severity: 'LOW' },
          { code: 'HK-05', question: 'Are flammable materials stored correctly?', severity: 'HIGH' },
        ],
      },
    ],
  },
];

/** What an inspector writes on an observation, per discipline. */
const OBSERVATION_TEXT: Record<(typeof DISCIPLINE_SLUGS)[number], { concern: string; positive: string }> = {
  'work-at-height': {
    concern: 'Worker on mobile scaffold without guardrail on one side',
    positive: 'Harness checks and rescue plan briefed before lift work',
  },
  'electrical-safety': {
    concern: 'Extension lead run across a pedestrian route without a cable cover',
    positive: 'Distribution board locked, labelled and RCD-tested this morning',
  },
  excavation: {
    concern: 'Open trench near the service road with incomplete hard barriers',
    positive: 'Trench shored and inspected, ladder access every 10 m',
  },
  'power-infrastructure': {
    concern: 'Generator refuelled while running, no spill kit nearby',
    positive: 'Generator compound fenced, earthed and fire extinguisher in place',
  },
  'overlay-temporary-infrastructure': {
    concern: 'Temporary signage frame missing ballast on the fan-zone side',
    positive: 'Temporary stand inspected and engineer certificate on display',
  },
  housekeeping: {
    concern: 'Cardboard and pallets stored in front of an emergency exit',
    positive: 'Concourse clear, waste segregated and bins emptied on schedule',
  },
};

const LOCATIONS = [
  'Gate A',
  'Gate C',
  'North stand',
  'East concourse',
  'West concourse',
  'Pitch level',
  'Media tribune',
  'Service road',
  'Fan zone',
  'VIP entrance',
];

const CONTRACTORS = ['Overlay contractor', 'Electrical contractor', 'Cleaning contractor', 'Venue operations'];

/** Readiness checklists submitted today per stadium, so the cards show varied progress. */
const TODAY_DONE: Record<string, number> = { KAS: 6, PAF: 4, ARM: 2, KFS: 5, KSU: 0, KDA: 3, IMU: 1, SHB: 6 };

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

async function wipe(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

interface SeededChecklist {
  checklistId: string;
  versionId: string;
  title: string;
  code: string;
  disciplineId: string | null;
  items: { id: string; code: string; question: string; defaultSeverity: Severity }[];
}

async function createChecklist(input: {
  title: string;
  titleAr: string;
  description: string;
  category: 'READINESS' | 'DISCIPLINE';
  disciplineId: string | null;
  code: string;
  createdById: string;
  createdAt: Date;
  sections: { title: string; titleAr?: string; items: { code: string; question: string; severity: Severity }[] }[];
}): Promise<SeededChecklist> {
  const checklistId = uuidv7();
  const versionId = uuidv7();
  const itemCount = input.sections.reduce((sum, section) => sum + section.items.length, 0);

  await prisma.checklist.create({
    data: {
      id: checklistId,
      title: input.title,
      titleAr: input.titleAr,
      description: input.description,
      category: input.category,
      disciplineId: input.disciplineId,
      isActive: true,
      createdAt: input.createdAt,
      // No ChecklistStadium rows: an empty set means "applies everywhere".
    },
  });

  await prisma.checklistVersion.create({
    data: {
      id: versionId,
      checklistId,
      version: 1,
      isPublished: true,
      publishedAt: input.createdAt,
      createdById: input.createdById,
      changeNote: 'Initial version',
      itemCount,
      createdAt: input.createdAt,
      sections: {
        create: input.sections.map((section, sectionIndex) => ({
          id: uuidv7(),
          title: section.title,
          titleAr: section.titleAr ?? null,
          sortOrder: sectionIndex,
          items: {
            create: section.items.map((item, itemIndex) => ({
              id: uuidv7(),
              code: item.code,
              question: item.question,
              defaultSeverity: item.severity,
              allowNa: true,
              sortOrder: itemIndex,
            })),
          },
        })),
      },
    },
  });

  await prisma.checklist.update({ where: { id: checklistId }, data: { currentVersionId: versionId } });

  const items = await prisma.checklistItem.findMany({
    where: { section: { versionId } },
    select: { id: true, code: true, question: true, defaultSeverity: true },
    orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });

  return {
    checklistId,
    versionId,
    title: input.title,
    code: input.code,
    disciplineId: input.disciplineId,
    items,
  };
}

async function main(): Promise<void> {
  console.log('Wiping existing data...');
  await wipe();

  console.log('Seeding Ahlan HSE demo data...');
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  const now = new Date();
  const today = zonedDateString(now, TIMEZONE);

  /* ----------------------------- tournament ---------------------------- */

  const tournamentStart = addDays(today, -20);
  const tournamentEnd = addDays(today, 20);
  const tournamentId = uuidv7();
  await prisma.tournament.create({
    data: {
      id: tournamentId,
      name: 'Ahlan Cup 2026',
      nameAr: 'كأس أهلاً 2026',
      startDate: toDate(tournamentStart),
      endDate: toDate(tournamentEnd),
      isActive: true,
    },
  });

  /* ------------------------------ stadiums ----------------------------- */

  const stadiums: ((typeof STADIUMS)[number] & { id: string })[] = [];
  for (const seed of STADIUMS) {
    const id = uuidv7();
    await prisma.stadium.create({
      data: {
        id,
        name: seed.name,
        nameAr: seed.nameAr,
        code: seed.code,
        city: seed.city,
        timezone: TIMEZONE,
        capacity: seed.capacity,
        latitude: seed.lat,
        longitude: seed.lng,
        isActive: true,
      },
    });
    stadiums.push({ id, ...seed });
  }
  const stadiumByCode = new Map(stadiums.map((stadium) => [stadium.code as string, stadium]));

  /* ----------------------------- disciplines --------------------------- */

  const disciplines: ((typeof DISCIPLINES)[number] & { id: string })[] = [];
  for (const [index, seed] of DISCIPLINES.entries()) {
    const id = uuidv7();
    await prisma.discipline.create({
      data: {
        id,
        slug: seed.slug,
        name: seed.name,
        nameAr: seed.nameAr,
        description: seed.description,
        descriptionAr: seed.descriptionAr,
        icon: seed.icon,
        colorToken: seed.colorToken,
        sortOrder: index,
        isActive: true,
      },
    });
    disciplines.push({ id, ...seed });
  }
  const disciplineBySlug = new Map(disciplines.map((d) => [d.slug, d]));

  /* -------------------------------- users ------------------------------ */

  const adminId = uuidv7();
  await prisma.user.create({
    data: {
      id: adminId,
      email: 'admin@ahlan.local',
      passwordHash,
      fullName: 'Hana Darwish',
      phone: '+966500000001',
      role: 'ADMIN',
      status: 'ACTIVE',
      organisation: 'Tournament HSE Office',
      jobTitle: 'HSE Administrator',
      locale: 'en',
    },
  });

  const inspectors: { id: string; email: string; fullName: string; stadium: (typeof stadiums)[number] }[] = [];
  for (const [index, stadium] of stadiums.entries()) {
    const id = uuidv7();
    const email = `inspector${index + 1}@ahlan.local`;
    const fullName = INSPECTOR_NAMES[index] as string;
    await prisma.user.create({
      data: {
        id,
        email,
        passwordHash,
        fullName,
        phone: `+9665000001${index}`,
        role: 'INSPECTOR',
        status: 'ACTIVE',
        organisation: 'Venue Operations',
        jobTitle: 'Venue Inspector',
        locale: index % 2 === 0 ? 'en' : 'ar',
        stadiums: { create: { stadiumId: stadium.id, assignedById: adminId } },
      },
    });
    inspectors.push({ id, email, fullName, stadium });
  }

  await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'supervisor@ahlan.local',
      passwordHash,
      fullName: 'Majid Salem',
      phone: '+966500000002',
      role: 'SUPERVISOR',
      status: 'ACTIVE',
      organisation: 'Tournament HSE Office',
      jobTitle: 'HSE Supervisor',
      locale: 'en',
      stadiums: {
        create: SUPERVISOR_STADIUMS.map((code) => ({
          stadiumId: stadiumByCode.get(code)!.id,
          assignedById: adminId,
        })),
      },
    },
  });

  // One pending access request, so the admin's approval screen has something in it.
  await prisma.accessRequest.create({
    data: {
      id: uuidv7(),
      email: 'pending@ahlan.local',
      passwordHash,
      fullName: 'Rami Khoury',
      phone: '+966500000099',
      organisation: 'Contractor Safety Team',
      jobTitle: 'Site Safety Officer',
      note: 'Requesting access to cover the north stand overlay works.',
      requestedStadiumIds: [stadiumByCode.get('KAS')!.id],
      status: 'PENDING',
    },
  });

  /* ------------------------------ checklists --------------------------- */

  // createdAt is staggered so lists keep the workbook's sheet order.
  const base = new Date(`${tournamentStart}T05:00:00.000Z`);
  const readiness: SeededChecklist[] = [];
  for (const [index, sheet] of READINESS.entries()) {
    readiness.push(
      await createChecklist({
        title: sheet.title,
        titleAr: sheet.titleAr,
        description: `Stadium Safety Readiness Checklist (251001-FR34SCL-HSE-V01) - ${sheet.title}.`,
        category: 'READINESS',
        disciplineId: null,
        code: sheet.code,
        createdById: adminId,
        createdAt: new Date(base.getTime() + index * 60_000),
        sections: [
          {
            title: sheet.title,
            titleAr: sheet.titleAr,
            items: sheet.items.map((question, itemIndex) => ({
              code: `${sheet.code}-${String(itemIndex + 1).padStart(2, '0')}`,
              question,
              severity: readinessSeverity(question),
            })),
          },
        ],
      }),
    );
  }

  const disciplineChecklists: SeededChecklist[] = [];
  for (const [index, seed] of DISCIPLINE_CHECKLISTS.entries()) {
    disciplineChecklists.push(
      await createChecklist({
        title: seed.title,
        titleAr: seed.titleAr,
        description: `Standard ${seed.title.toLowerCase()} used across all venues.`,
        category: 'DISCIPLINE',
        disciplineId: disciplineBySlug.get(seed.slug)?.id ?? null,
        code: seed.slug,
        createdById: adminId,
        createdAt: new Date(base.getTime() + (10 + index) * 60_000),
        sections: seed.sections,
      }),
    );
  }

  /* ----------------------------- EOD window ---------------------------- */

  // The recurring default only: no per-date rows, so the admin's setting rules.
  await prisma.eodWindowDefault.create({
    data: {
      id: uuidv7(),
      stadiumId: null,
      startTime: '18:00',
      endTime: '23:00',
      enabled: true,
      updatedById: adminId,
    },
  });

  /* --------------------- inspections, findings, EOD -------------------- */

  const findingCounter = new Map<string, number>();
  const counts = { inspections: 0, observations: 0, findings: 0, actions: 0, eod: 0 };

  async function raiseFinding(input: {
    stadium: (typeof stadiums)[number];
    inspectorId: string;
    disciplineId: string | null;
    source: 'INSPECTION' | 'OBSERVATION';
    inspectionId?: string;
    inspectionResponseId?: string;
    observationId?: string;
    title: string;
    description: string;
    severity: Severity;
    localDate: string;
    raisedAt: Date;
    ageDays: number;
  }): Promise<void> {
    const next = (findingCounter.get(input.stadium.code) ?? 0) + 1;
    findingCounter.set(input.stadium.code, next);
    const findingId = uuidv7();

    // Older findings have progressed through every status; the newest are
    // still OPEN, and actions due in the past and not closed read as overdue.
    let status: 'OPEN' | 'ACTION_ASSIGNED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'CLOSED' = 'OPEN';
    if (input.ageDays > 1) {
      const progress = random();
      const closeChance = Math.min(0.6, input.ageDays * 0.05);
      status =
        progress < closeChance
          ? 'CLOSED'
          : progress < closeChance + 0.15
            ? 'PENDING_VERIFICATION'
            : progress < closeChance + 0.35
              ? 'IN_PROGRESS'
              : progress < closeChance + 0.55
                ? 'ACTION_ASSIGNED'
                : 'OPEN';
    }
    // A due date a few days after raising would leave every still-open action
    // from the older history overdue. Keep roughly one in five overdue and move
    // the rest into the coming days, which is what a working site looks like.
    const raisedDue = addDays(input.localDate, input.severity === 'CRITICAL' ? 1 : 3);
    const dueDate =
      status !== 'CLOSED' && raisedDue < today && random() >= 0.2
        ? addDays(today, between(1, 5))
        : raisedDue;
    const closedAt = status === 'CLOSED' ? localInstant(addDays(input.localDate, between(1, 3)), 14) : null;

    await prisma.finding.create({
      data: {
        id: findingId,
        reference: `F-${input.stadium.code}-${String(next).padStart(5, '0')}`,
        stadiumId: input.stadium.id,
        tournamentId,
        disciplineId: input.disciplineId,
        source: input.source,
        inspectionId: input.inspectionId ?? null,
        inspectionResponseId: input.inspectionResponseId ?? null,
        observationId: input.observationId ?? null,
        raisedById: input.inspectorId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        status,
        localDate: toDate(input.localDate),
        raisedAt: input.raisedAt,
        closedAt,
      },
    });
    counts.findings += 1;

    if (status !== 'OPEN') {
      await prisma.correctiveAction.create({
        data: {
          id: uuidv7(),
          findingId,
          assigneeId: input.inspectorId,
          responsibleParty: pick(CONTRACTORS),
          action: `Rectify and provide photographic evidence of closure: ${input.title}`,
          dueDate: toDate(dueDate),
          status,
          startedAt: status === 'ACTION_ASSIGNED' ? null : input.raisedAt,
          completedAt:
            status === 'PENDING_VERIFICATION' || status === 'CLOSED'
              ? localInstant(raisedDue < today ? raisedDue : addDays(today, -1), 11)
              : null,
          verifiedAt: closedAt,
          verifiedById: status === 'CLOSED' ? adminId : null,
          closureNote: status === 'CLOSED' ? 'Verified on site; corrective work accepted.' : null,
        },
      });
      counts.actions += 1;
    }
  }

  async function submitInspection(input: {
    inspector: (typeof inspectors)[number];
    checklist: SeededChecklist;
    localDate: string;
    ageDays: number;
    hour: number;
  }): Promise<void> {
    const { inspector, checklist, localDate, ageDays } = input;
    const stadium = inspector.stadium;
    const inspectionId = uuidv7();
    const startedAt = localInstant(localDate, input.hour, between(0, 30));
    const submittedAt = new Date(startedAt.getTime() + between(20, 55) * 60_000);

    // Compliance drifts upwards over the fortnight, so the trend reads like a
    // tournament that is improving; stadiums differ a little.
    const failureChance = Math.max(0.02, 0.14 - (HISTORY_DAYS - ageDays) * 0.007 + (stadium.code.charCodeAt(0) % 5) * 0.01);
    const answers = checklist.items.map((item) => {
      const roll = random();
      const value: ResponseValue =
        roll < failureChance ? 'NO' : roll < failureChance + 0.06 ? 'NA' : 'YES';
      return { item, value, id: uuidv7() };
    });
    const tally = tallyResponses(answers.map((answer) => answer.value));
    const compliance = compliancePercent(tally);
    const location = pick(LOCATIONS);

    await prisma.inspection.create({
      data: {
        id: inspectionId,
        stadiumId: stadium.id,
        tournamentId,
        checklistId: checklist.checklistId,
        checklistVersionId: checklist.versionId,
        inspectorId: inspector.id,
        status: 'SUBMITTED',
        localDate: toDate(localDate),
        startedAt,
        clientCreatedAt: startedAt,
        submittedAt,
        serverReceivedAt: submittedAt,
        latitude: stadium.lat + (random() - 0.5) * 0.002,
        longitude: stadium.lng + (random() - 0.5) * 0.002,
        gpsAccuracyM: between(4, 25),
        deviceId: `demo-device-${inspector.email}`,
        appVersion: '0.2.0',
        yesCount: tally.yes,
        noCount: tally.no,
        naCount: tally.na,
        compliancePercent: compliance === null ? null : compliance.toFixed(2),
        locationLabel: location,
        otherObservations:
          checklist.code === 'PM' && random() < 0.4
            ? 'Stewards briefed late at Gate C; venue manager informed.'
            : null,
        isLocked: true,
        responses: {
          create: answers.map((answer) => ({
            id: answer.id,
            itemId: answer.item.id,
            itemCode: answer.item.code,
            value: answer.value,
            concern: answer.value === 'NO' ? `Not satisfactory at ${location}.` : null,
            recommendation:
              answer.value === 'NO' ? 'Responsible contractor to rectify before gates open.' : null,
            answeredAt: submittedAt,
          })),
        },
      },
    });
    counts.inspections += 1;

    for (const answer of answers) {
      if (answer.value !== 'NO') continue;
      await raiseFinding({
        stadium,
        inspectorId: inspector.id,
        disciplineId: checklist.disciplineId,
        source: 'INSPECTION',
        inspectionId,
        inspectionResponseId: answer.id,
        title: `${answer.item.code}: ${answer.item.question}`,
        description: `Not satisfactory at ${location}.`,
        severity: answer.item.defaultSeverity,
        localDate,
        raisedAt: submittedAt,
        ageDays,
      });
    }
  }

  async function submitObservation(input: {
    inspector: (typeof inspectors)[number];
    discipline: (typeof disciplines)[number];
    localDate: string;
    ageDays: number;
  }): Promise<void> {
    const { inspector, discipline, localDate, ageDays } = input;
    const stadium = inspector.stadium;
    const type = pick<ObservationType>(['UNSAFE_ACT', 'UNSAFE_CONDITION', 'UNSAFE_CONDITION', 'POSITIVE', 'NEAR_MISS']);
    const severity = type === 'POSITIVE' ? 'LOW' : pick<Severity>(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL']);
    const observedAt = localInstant(localDate, between(10, 17), between(0, 59));
    const observationId = uuidv7();
    const text = OBSERVATION_TEXT[discipline.slug];
    const title = type === 'POSITIVE' ? text.positive : text.concern;

    await prisma.observation.create({
      data: {
        id: observationId,
        stadiumId: stadium.id,
        tournamentId,
        disciplineId: discipline.id,
        inspectorId: inspector.id,
        type,
        severity,
        riskRating: severity === 'CRITICAL' ? 'EXTREME' : severity === 'HIGH' ? 'HIGH' : severity === 'MEDIUM' ? 'MODERATE' : 'LOW',
        title,
        description:
          type === 'POSITIVE'
            ? 'Shared with the venue team as good practice.'
            : 'Identified during the routine patrol. Contractor supervisor informed immediately.',
        locationLabel: pick(LOCATIONS),
        responsibleParty: pick(CONTRACTORS),
        immediateAction:
          type === 'POSITIVE' ? null : 'Area made safe and works paused pending rectification.',
        status: 'SUBMITTED',
        localDate: toDate(localDate),
        observedAt,
        clientCreatedAt: observedAt,
        submittedAt: observedAt,
        serverReceivedAt: observedAt,
        latitude: stadium.lat + (random() - 0.5) * 0.002,
        longitude: stadium.lng + (random() - 0.5) * 0.002,
        isLocked: true,
      },
    });
    counts.observations += 1;

    // The unsafe types raise a finding; POSITIVE does not.
    if (type !== 'POSITIVE') {
      await raiseFinding({
        stadium,
        inspectorId: inspector.id,
        disciplineId: discipline.id,
        source: 'OBSERVATION',
        observationId,
        title,
        description: 'Identified during the routine patrol.',
        severity,
        localDate,
        raisedAt: observedAt,
        ageDays,
      });
    }
  }

  async function submitEod(input: {
    inspector: (typeof inspectors)[number];
    localDate: string;
    ageDays: number;
  }): Promise<void> {
    const { inspector, localDate } = input;
    const stadium = inspector.stadium;
    const submittedAt = localInstant(localDate, 19, between(0, 50));
    const matchDay = (stadium.code.charCodeAt(1) + input.ageDays) % 3 === 0;

    const lines = EOD_DEFAULT_WORKFORCE_CATEGORIES.map((category) => {
      const personnel =
        category === 'Stewards'
          ? between(matchDay ? 250 : 40, matchDay ? 600 : 120)
          : category === 'Volunteers'
            ? between(matchDay ? 80 : 10, matchDay ? 220 : 50)
            : between(5, 60);
      const hours = pick(['8.00', '8.50', '10.00', '12.00', '6.00']);
      return { category, personnel, hours };
    }).filter((line) => line.personnel > 0);
    const totals = eodWorkforceTotals(lines);

    const [inspectionsCompleted, observationsRaised, findingsRaised] = await Promise.all([
      prisma.inspection.count({
        where: { stadiumId: stadium.id, inspectorId: inspector.id, localDate: toDate(localDate) },
      }),
      prisma.observation.count({
        where: { stadiumId: stadium.id, inspectorId: inspector.id, localDate: toDate(localDate) },
      }),
      prisma.finding.count({
        where: { stadiumId: stadium.id, raisedById: inspector.id, localDate: toDate(localDate) },
      }),
    ]);

    const workRelatedMedical = random() < 0.08 ? 1 : 0;
    await prisma.eodReport.create({
      data: {
        id: uuidv7(),
        stadiumId: stadium.id,
        tournamentId,
        inspectorId: inspector.id,
        date: toDate(localDate),
        status: 'SUBMITTED',
        totalHeadcount: totals.totalHeadcount,
        totalManHours: totals.totalManHours,
        totalSpectators: matchDay ? Math.floor(stadium.capacity * (0.55 + random() * 0.4)) : null,
        workRelatedMedical,
        recordableIncidents: workRelatedMedical,
        nonWorkRelatedMedical: matchDay ? between(0, 6) : between(0, 1),
        firstAidCases: matchDay ? between(2, 14) : between(0, 3),
        fireIncidents: random() < 0.03 ? 1 : 0,
        otherIncidents: random() < 0.1 ? 1 : 0,
        hseObservationsReported: observationsRaised,
        nearMisses: random() < 0.12 ? 1 : 0,
        inspectionsCompleted,
        observationsRaised,
        findingsRaised,
        findingsClosed: between(0, 3),
        summary: matchDay
          ? 'Match day operations ran to plan. Gates opened on time, readiness checklists completed before opening and stewards deployed across all stands.'
          : 'Overlay and readiness works progressed as planned across the concourse and fan zone. Non-compliances were briefed to the responsible contractors before shift end.',
        concerns:
          random() < 0.4 ? 'Overlay works are running behind on the east side; trip hazards on the service road.' : null,
        actionsMitigation:
          random() < 0.5 ? 'Additional cable covers issued and the east-side route re-barriered.' : null,
        plannedTomorrow: matchDay
          ? 'Post-match walk-through and removal of temporary barriers.'
          : 'Complete the readiness checklists and re-inspect open findings.',
        additionalRemarks: random() < 0.25 ? 'High temperatures expected; hydration points checked.' : null,
        weather: pick(['Clear, 34C', 'Hazy, 31C', 'Clear, 29C', 'Dusty, 36C']),
        clientCreatedAt: submittedAt,
        submittedAt,
        serverReceivedAt: submittedAt,
        latitude: stadium.lat,
        longitude: stadium.lng,
        isLocked: true,
        workforce: {
          create: lines.map((line, index) => ({
            id: uuidv7(),
            category: line.category,
            personnel: line.personnel,
            hours: line.hours,
            manHours: workforceManHours(line),
            sortOrder: index,
          })),
        },
      },
    });
    counts.eod += 1;
  }

  // The last fortnight of activity, oldest first, so dashboards, trends and
  // reports have shape. Today gets a partial day: varied readiness progress, no
  // EOD yet (the 18:00 window has not opened), so chase-up lists have rows.
  for (let ageDays = HISTORY_DAYS - 1; ageDays >= 0; ageDays -= 1) {
    const localDate = addDays(today, -ageDays);
    const isToday = ageDays === 0;

    for (const [index, inspector] of inspectors.entries()) {
      const readinessDone = isToday
        ? (TODAY_DONE[inspector.stadium.code] ?? 0)
        : between(3, 6);
      for (const [order, checklist] of readiness.slice(0, readinessDone).entries()) {
        await submitInspection({ inspector, checklist, localDate, ageDays, hour: 7 + order });
      }

      if (!isToday && random() < 0.5) {
        // Rotate so every discipline checklist gets answers over the fortnight.
        const checklist = disciplineChecklists[(index + ageDays) % disciplineChecklists.length]!;
        await submitInspection({ inspector, checklist, localDate, ageDays, hour: 14 });
      }

      const observationCount = isToday ? between(0, 1) : between(1, 2);
      for (let n = 0; n < observationCount; n += 1) {
        const discipline = disciplines[(index + ageDays + n * 3) % disciplines.length]!;
        await submitObservation({ inspector, discipline, localDate, ageDays });
      }

      if (!isToday) await submitEod({ inspector, localDate, ageDays });
    }
  }

  /* --------------------------- reference counters ---------------------- */

  // The seed inserts findings directly with its own counter, so the per-stadium
  // `reference_counters` rows have to be brought up to the same value. Without
  // this, the first finding raised through the API would try to reuse
  // `F-<CODE>-00001` and fail on the unique constraint.
  if (findingCounter.size > 0) {
    await prisma.referenceCounter.createMany({
      data: [...findingCounter.entries()].map(([stadiumCode, value]) => ({
        key: `finding:${stadiumCode}`,
        value,
      })),
    });
  }

  /* ------------------------------- summary ----------------------------- */

  const [users, responses, findings, actions, overdue] = await Promise.all([
    prisma.user.count(),
    prisma.inspectionResponse.count(),
    prisma.finding.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.correctiveAction.count(),
    prisma.correctiveAction.count({ where: { status: { not: 'CLOSED' }, dueDate: { lt: toDate(today) } } }),
  ]);

  console.log(`
Seed complete.

  Tournament   Ahlan Cup 2026 (${tournamentStart} to ${tournamentEnd}, ${TIMEZONE})
  Stadiums     ${stadiums.length}
  Disciplines  ${disciplines.length}
  Checklists   ${readiness.length} readiness + ${disciplineChecklists.length} discipline (version 1, published)
  Users        ${users} (1 admin, 1 supervisor, ${inspectors.length} inspectors) + 1 pending request
  Inspections  ${counts.inspections} (${responses} responses)
  Observations ${counts.observations}
  Findings     ${counts.findings} (${findings.map((row) => `${row.status} ${row._count._all}`).join(', ')})
  Actions      ${actions} (${overdue} overdue)
  EOD reports  ${counts.eod}
  EOD window   global default 18:00-23:00, enabled

Sign in with admin@ahlan.local, supervisor@ahlan.local or inspector1..8@ahlan.local
(password ${DEMO_PASSWORD}).
`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
