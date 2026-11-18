import {
  BookMarked, BookOpen, Boxes, Cable, ClipboardList, Cpu, Database, File, FileSpreadsheet, FileText, FileType,
  Folder, GraduationCap, HelpCircle, LayoutTemplate, Layers, ListChecks, Network, Paperclip, Presentation,
  Server, Shield, Video, Workflow, Wrench, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  'file-text': FileText,
  'file-type': FileType,
  sheet: FileSpreadsheet,
  file: File,
  'book-open': BookOpen,
  'book-marked': BookMarked,
  workflow: Workflow,
  layout: LayoutTemplate,
  video: Video,
  'list-checks': ListChecks,
  paperclip: Paperclip,
  cable: Cable,
  network: Network,
  server: Server,
  database: Database,
  cpu: Cpu,
  boxes: Boxes,
  layers: Layers,
  clipboard: ClipboardList,
  presentation: Presentation,
  graduation: GraduationCap,
  wrench: Wrench,
  shield: Shield,
  help: HelpCircle,
};
export const ICON_KEYS = Object.keys(ICONS);
export const iconFor = (key: string | null | undefined): LucideIcon => ICONS[key ?? ''] ?? Folder;

const TONES = ['tone-teal', 'tone-green', 'tone-lime', 'tone-petrol'] as const;
const TYPE_TONE: Record<string, (typeof TONES)[number]> = {
  pdf: 'tone-teal', word: 'tone-teal', excel: 'tone-green', glossario: 'tone-lime', fluxograma: 'tone-petrol',
  prototipo: 'tone-petrol', video: 'tone-lime', checklist: 'tone-green', manual: 'tone-teal', outro: 'tone-petrol',
};
export const toneForType = (key: string) => TYPE_TONE[key] ?? 'tone-petrol';
export const toneForIndex = (i: number) => TONES[i % TONES.length];
