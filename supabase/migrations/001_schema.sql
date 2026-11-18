-- =====================================================================
-- Portal de conhecimento Sicoob | UnB — schema, RLS e armazenamento
-- Execute no Supabase: SQL Editor > New query > colar > Run.
-- É idempotente: pode ser executado novamente sem duplicar objetos.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.norm_text(t text)
returns text
language sql
stable
set search_path = ''
as $$ select lower(extensions.unaccent(coalesce(t, ''))) $$;

-- ---------------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth). Login = username.
-- O e-mail do Auth é apenas um identificador interno derivado do
-- username; nunca é exibido, confirmado nem usado para envio.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
              check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 120),
  role        text not null default 'user' check (role in ('admin', 'user')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------
-- Categorias (com subcategorias de um nível)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  icon        text not null default 'folder',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists categories_unique_name
  on public.categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create or replace function public.categories_check_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null) then
      raise exception 'Subcategorias só podem ter um nível.' using errcode = '23514';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'Uma categoria que já possui subcategorias não pode virar subcategoria.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tipos de material (formato do conteúdo)
-- ---------------------------------------------------------------------
create table if not exists public.document_types (
  key        text primary key check (key ~ '^[a-z0-9_]+$'),
  label      text not null,
  icon       text not null default 'file',
  sort_order integer not null default 0
);

insert into public.document_types (key, label, icon, sort_order) values
  ('pdf',        'PDF',                         'file-text',      10),
  ('word',       'Documento Word',              'file-type',      20),
  ('excel',      'Planilha Excel',              'sheet',          30),
  ('glossario',  'Glossário',                   'book-open',      40),
  ('fluxograma', 'Fluxograma / mapa de processo','workflow',      50),
  ('prototipo',  'Protótipo / mapeamento de telas','layout',      60),
  ('video',      'Vídeo / gravação',            'video',          70),
  ('checklist',  'Checklist',                   'list-checks',    80),
  ('manual',     'Manual / procedimento',       'book-marked',    90),
  ('outro',      'Outro material',              'paperclip',     100)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Documentos e entregáveis (arquivo no Storage OU link externo)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(btrim(title)) between 3 and 200),
  description       text check (description is null or char_length(description) <= 2000),
  category_id       uuid references public.categories (id) on delete set null,
  type_key          text not null references public.document_types (key),
  source_kind       text not null check (source_kind in ('file', 'link')),
  storage_path      text,
  file_name         text,
  file_size         bigint,
  mime_type         text,
  external_url      text check (external_url is null or external_url ~* '^https?://'),
  external_provider text,
  tags              text[] not null default '{}',
  search_text       text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  constraint documents_source_consistent check (
    (source_kind = 'file' and storage_path is not null and external_url is null) or
    (source_kind = 'link' and external_url is not null and storage_path is null)
  )
);
create index if not exists documents_category_idx on public.documents (category_id);
create index if not exists documents_type_idx     on public.documents (type_key);
create index if not exists documents_created_idx  on public.documents (created_at desc);

-- ---------------------------------------------------------------------
-- FAQ colaborativo
--   pending   = sugerida/enviada por usuário, aguardando o administrador
--   published = visível para todos
--   rejected  = recusada (autor vê a justificativa e pode reenviar)
-- ---------------------------------------------------------------------
create table if not exists public.faq_items (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (char_length(btrim(question)) between 5 and 300),
  answer      text check (answer is null or char_length(answer) <= 10000),
  category_id uuid references public.categories (id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  search_text text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint faq_published_needs_answer check (
    status <> 'published' or (answer is not null and char_length(btrim(answer)) > 0)
  )
);
create index if not exists faq_items_category_idx on public.faq_items (category_id);
create index if not exists faq_items_status_idx   on public.faq_items (status);

create table if not exists public.faq_item_documents (
  faq_item_id uuid not null references public.faq_items (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  primary key (faq_item_id, document_id)
);
create index if not exists faq_item_documents_doc_idx on public.faq_item_documents (document_id);

-- ---------------------------------------------------------------------
-- Sugestões de conteúdo (novos materiais, correções de respostas, outros)
-- ---------------------------------------------------------------------
create table if not exists public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('document', 'faq_correction', 'other')),
  title       text not null check (char_length(btrim(title)) between 3 and 200),
  details     text check (details is null or char_length(details) <= 3000),
  url         text check (url is null or url ~* '^https?://'),
  faq_item_id uuid references public.faq_items (id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index if not exists suggestions_status_idx on public.suggestions (status, created_at desc);

-- ---------------------------------------------------------------------
-- Histórico de criação e atualização dos conteúdos (preenchido por trigger)
-- ---------------------------------------------------------------------
create table if not exists public.content_history (
  id             bigint generated always as identity primary key,
  entity_type    text not null,
  entity_id      uuid not null,
  entity_title   text,
  action         text not null check (action in ('create', 'update', 'delete')),
  changed_fields text[] not null default '{}',
  detail         text,
  actor_id       uuid,
  actor_username text,
  created_at     timestamptz not null default now()
);
create index if not exists content_history_created_idx on public.content_history (created_at desc);
create index if not exists content_history_entity_idx  on public.content_history (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- Triggers: carimbo de autoria/data, texto de busca e histórico
-- ---------------------------------------------------------------------
create or replace function public.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  has_updated_by boolean := (to_jsonb(new) ? 'updated_by');
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    if uid is not null and has_updated_by then new.updated_by := uid; end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if uid is not null and has_updated_by then new.updated_by := uid; end if;
  end if;
  if to_jsonb(new) ? 'updated_at' then new.updated_at := now(); end if;
  return new;
end;
$$;

create or replace function public.documents_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := public.norm_text(
    new.title || ' ' || coalesce(new.description, '') || ' ' ||
    array_to_string(new.tags, ' ') || ' ' || coalesce(new.file_name, '')
  );
  return new;
end;
$$;

create or replace function public.faq_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := public.norm_text(new.question || ' ' || coalesce(new.answer, ''));
  return new;
end;
$$;

-- Regras de moderação do FAQ: usuário comum sempre cria "pending",
-- não altera status/revisão; ao reeditar uma pergunta recusada ela volta a "pending".
create or replace function public.faq_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new;                      -- service_role / migrações
  end if;
  if (select public.is_admin()) then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.reviewed_by := uid;
      new.reviewed_at := now();
      if new.status = 'published' then new.review_note := null; end if;
    elsif tg_op = 'INSERT' and new.status <> 'pending' then
      new.reviewed_by := uid;
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' or old.status = 'rejected' then
    -- usuário comum: sempre entra (ou volta, se foi reeditada) como "pending"
    new.status := 'pending';
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.status := old.status;
    new.review_note := old.review_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

create or replace function public.suggestions_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'open'; new.admin_note := null;
    new.resolved_at := null; new.resolved_by := null;
  elsif new.status is distinct from old.status then
    new.resolved_by := uid;
    new.resolved_at := case when new.status = 'open' then null else now() end;
    if new.status = 'open' then new.resolved_by := null; end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec       jsonb;
  old_rec   jsonb;
  fields    text[];
  ttl       text;
  uid       uuid := (select auth.uid());
  uname     text;
  det       text;
  etype     text;
begin
  etype := case tg_table_name
    when 'documents'  then 'document'
    when 'categories' then 'category'
    when 'faq_items'  then 'faq'
    else tg_table_name end;

  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  ttl := coalesce(rec ->> 'title', rec ->> 'question', rec ->> 'name');
  select p.username into uname from public.profiles p where p.id = uid;

  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);
    select coalesce(array_agg(k order by k), '{}') into fields
    from jsonb_object_keys(rec) k
    where k not in ('updated_at', 'updated_by', 'search_text', 'reviewed_at', 'reviewed_by')
      and (rec -> k) is distinct from (old_rec -> k);
    if coalesce(array_length(fields, 1), 0) = 0 then
      return new;
    end if;
    if tg_table_name = 'faq_items' and (rec ->> 'status') is distinct from (old_rec ->> 'status') then
      det := 'status: ' || (old_rec ->> 'status') || ' → ' || (rec ->> 'status');
    end if;
  elsif tg_op = 'INSERT' then
    fields := '{}';
    if tg_table_name = 'faq_items' then det := 'status: ' || (rec ->> 'status'); end if;
  else
    fields := '{}';
  end if;

  insert into public.content_history
    (entity_type, entity_id, entity_title, action, changed_fields, detail, actor_id, actor_username)
  values
    (etype, (rec ->> 'id')::uuid, ttl,
     case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
     fields, det, uid, uname);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  -- carimbo
  foreach t in array array['categories', 'documents', 'faq_items', 'suggestions'] loop
    execute format('drop trigger if exists trg_stamp on public.%I', t);
    execute format('create trigger trg_stamp before insert or update on public.%I
                    for each row execute function public.stamp_row()', t);
  end loop;
  -- histórico
  foreach t in array array['categories', 'documents', 'faq_items'] loop
    execute format('drop trigger if exists trg_history on public.%I', t);
    execute format('create trigger trg_history after insert or update or delete on public.%I
                    for each row execute function public.log_history()', t);
  end loop;
end $$;

drop trigger if exists trg_categories_depth on public.categories;
create trigger trg_categories_depth before insert or update of parent_id on public.categories
  for each row execute function public.categories_check_depth();

drop trigger if exists trg_documents_search on public.documents;
create trigger trg_documents_search before insert or update on public.documents
  for each row execute function public.documents_search_text();

drop trigger if exists trg_faq_search on public.faq_items;
create trigger trg_faq_search before insert or update on public.faq_items
  for each row execute function public.faq_search_text();

drop trigger if exists trg_faq_moderation on public.faq_items;
create trigger trg_faq_moderation before insert or update on public.faq_items
  for each row execute function public.faq_moderation();

drop trigger if exists trg_suggestions_moderation on public.suggestions;
create trigger trg_suggestions_moderation before insert or update on public.suggestions
  for each row execute function public.suggestions_moderation();

-- ---------------------------------------------------------------------
-- Visão com contagens por categoria (respeita o RLS de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.category_stats
with (security_invoker = true) as
select
  c.id as category_id,
  (select count(*) from public.documents d where d.category_id = c.id) as documents,
  (select count(*) from public.faq_items f
     where f.category_id = c.id and f.status = 'published') as faqs
from public.categories c;

-- ---------------------------------------------------------------------
-- Privilégios: nada para anon; authenticated só o necessário.
-- Escritas em profiles só ocorrem pelas Netlify Functions (service_role).
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;

grant select on public.profiles, public.document_types, public.category_stats,
                public.content_history to authenticated;
grant select, insert, update, delete on public.categories, public.documents,
                public.faq_items, public.faq_item_documents, public.suggestions to authenticated;
grant insert, update, delete on public.document_types to authenticated;

grant execute on function public.is_active_member(), public.is_admin(),
                         public.norm_text(text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.document_types      enable row level security;
alter table public.documents           enable row level security;
alter table public.faq_items           enable row level security;
alter table public.faq_item_documents  enable row level security;
alter table public.suggestions         enable row level security;
alter table public.content_history     enable row level security;

-- profiles: leitura por membros ativos (nomes de autores) ou pelo próprio usuário.
-- Sem políticas de escrita: apenas service_role (Netlify Functions) altera.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_member()));

-- categories
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- document_types
drop policy if exists document_types_select on public.document_types;
create policy document_types_select on public.document_types for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists document_types_admin_write on public.document_types;
create policy document_types_admin_write on public.document_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- documents
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists documents_admin_write on public.documents;
create policy documents_admin_write on public.documents for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- faq_items
drop policy if exists faq_select on public.faq_items;
create policy faq_select on public.faq_items for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_active_member())
        and (status = 'published' or created_by = (select auth.uid())))
  );
drop policy if exists faq_insert on public.faq_items;
create policy faq_insert on public.faq_items for insert to authenticated
  with check ((select public.is_admin()) or (select public.is_active_member()));
drop policy if exists faq_update on public.faq_items;
create policy faq_update on public.faq_items for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_active_member())
        and created_by = (select auth.uid()) and status in ('pending', 'rejected'))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_active_member())
        and created_by = (select auth.uid()) and status = 'pending')
  );
drop policy if exists faq_delete on public.faq_items;
create policy faq_delete on public.faq_items for delete to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_active_member())
        and created_by = (select auth.uid()) and status in ('pending', 'rejected'))
  );

-- faq_item_documents (vinculação de materiais às respostas)
drop policy if exists faqdocs_select on public.faq_item_documents;
create policy faqdocs_select on public.faq_item_documents for select to authenticated
  using (exists (select 1 from public.faq_items f where f.id = faq_item_id));
drop policy if exists faqdocs_insert on public.faq_item_documents;
create policy faqdocs_insert on public.faq_item_documents for insert to authenticated
  with check (exists (
    select 1 from public.faq_items f
    where f.id = faq_item_id
      and ((select public.is_admin())
           or (f.created_by = (select auth.uid()) and f.status in ('pending', 'rejected')))
  ));
drop policy if exists faqdocs_delete on public.faq_item_documents;
create policy faqdocs_delete on public.faq_item_documents for delete to authenticated
  using (exists (
    select 1 from public.faq_items f
    where f.id = faq_item_id
      and ((select public.is_admin())
           or (f.created_by = (select auth.uid()) and f.status in ('pending', 'rejected')))
  ));

-- suggestions
drop policy if exists suggestions_select on public.suggestions;
create policy suggestions_select on public.suggestions for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_active_member()) and created_by = (select auth.uid())));
drop policy if exists suggestions_insert on public.suggestions;
create policy suggestions_insert on public.suggestions for insert to authenticated
  with check ((select public.is_active_member()));
drop policy if exists suggestions_update on public.suggestions;
create policy suggestions_update on public.suggestions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists suggestions_delete on public.suggestions;
create policy suggestions_delete on public.suggestions for delete to authenticated
  using ((select public.is_admin())
         or ((select public.is_active_member()) and created_by = (select auth.uid()) and status = 'open'));

-- content_history: somente administradores leem; ninguém grava direto.
drop policy if exists history_select on public.content_history;
create policy history_select on public.content_history for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Storage: bucket privado "documentos"
--   leitura: membros ativos | escrita: somente administradores
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 52428800)   -- 50 MB (limite do plano gratuito)
on conflict (id) do update set public = false;

drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (select public.is_active_member()));
drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (select public.is_admin()));
drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (select public.is_admin()))
  with check (bucket_id = 'documentos' and (select public.is_admin()));
drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (select public.is_admin()));
