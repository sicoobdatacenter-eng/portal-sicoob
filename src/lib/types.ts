export type Role = 'admin' | 'user';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
export interface AdminUser extends Profile { last_sign_in_at: string | null; }

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface CategoryStat { category_id: string; documents: number; faqs: number; }

export interface DocType { key: string; label: string; icon: string; sort_order: number; }

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  type_key: string;
  source_kind: 'file' | 'link';
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  external_url: string | null;
  external_provider: string | null;
  tags: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type FaqStatus = 'pending' | 'published' | 'rejected';
export interface FaqItem {
  id: string;
  question: string;
  answer: string | null;
  category_id: string | null;
  status: FaqStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  faq_item_documents?: { document_id: string }[];
}

export type SuggestionKind = 'document' | 'faq_correction' | 'other';
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  details: string | null;
  url: string | null;
  faq_item_id: string | null;
  status: 'open' | 'accepted' | 'rejected';
  admin_note: string | null;
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface HistoryRow {
  id: number;
  entity_type: 'document' | 'category' | 'faq' | string;
  entity_id: string;
  entity_title: string | null;
  action: 'create' | 'update' | 'delete';
  changed_fields: string[];
  detail: string | null;
  actor_id: string | null;
  actor_username: string | null;
  created_at: string;
}
