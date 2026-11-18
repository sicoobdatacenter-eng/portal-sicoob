// Testa schema + RLS em um Postgres embutido (PGlite), com stubs mínimos do Supabase.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.on('uncaughtException', (e) => { console.error('ERRO:', e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('ERRO:', e?.message ?? e); process.exit(1); });
const db = new PGlite({ extensions: { unaccent } });

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log('  ok   ', name); }
  else { failed++; console.log('  FALHOU', name, extra); }
};
const sql = (q, p) => db.query(q, p);
const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
};
const asAnon = async (fn) => {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
};
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// --- stubs do Supabase ---------------------------------------------------
await db.exec(`
  create schema extensions;
  create role anon nologin; create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, extensions to anon, authenticated;
  grant all on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
`);

const migration = readFileSync(join(root, 'supabase/migrations/001_schema.sql'), 'utf8');
const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8');

console.log('Migração e seed');
await db.exec(migration);
await db.exec(migration);               // idempotência
await db.exec(seed);
await db.exec(seed);
ok((await sql('select count(*)::int n from categories')).rows[0].n === 7, 'seed: 7 categorias, sem duplicar');
ok((await sql('select count(*)::int n from documents')).rows[0].n === 4, 'seed: 4 documentos reais, sem duplicar');
ok((await sql(`select count(*)::int n from documents where category_id is null`)).rows[0].n === 0, 'seed: todos os documentos têm categoria');

// --- usuários ------------------------------------------------------------
const ADM = '00000000-0000-0000-0000-0000000000a1';
const U1  = '00000000-0000-0000-0000-0000000000b1';
const U2  = '00000000-0000-0000-0000-0000000000b2';
const OFF = '00000000-0000-0000-0000-0000000000c1';
for (const [id, u] of [[ADM,'admin'],[U1,'ana'],[U2,'bruno'],[OFF,'inativo']]) {
  await sql(`insert into auth.users (id, email) values ($1, $2)`, [id, `${u}@x.local`]);
}
await sql(`insert into profiles (id, username, full_name, role, active) values
  ($1,'admin','Administrador','admin',true), ($2,'ana','Ana','user',true),
  ($3,'bruno','Bruno','user',true), ($4,'inativo','Inativo','user',false)`, [ADM, U1, U2, OFF]);

console.log('Acesso anônimo e inativo');
ok(!!(await asAnon(() => fails(() => sql('select * from documents')))), 'anon não lê documents');
ok(!!(await asAnon(() => fails(() => sql('select * from profiles')))), 'anon não lê profiles');
ok((await as(OFF, () => sql('select * from documents'))).rows.length === 0, 'usuário inativo enxerga 0 documentos');
ok((await as(OFF, () => sql('select * from categories'))).rows.length === 0, 'usuário inativo enxerga 0 categorias');

console.log('Usuário comum');
ok((await as(U1, () => sql('select * from documents'))).rows.length === 4, 'lê documentos');
ok((await as(U1, () => sql('select * from profiles'))).rows.length === 4, 'lê perfis (nomes de autores)');
ok(!!(await as(U1, () => fails(() => sql(`insert into documents (title,type_key,source_kind,external_url) values ('Teste doc','pdf','link','https://x.com')`)))), 'não cria documento');
ok(!!(await as(U1, () => fails(() => sql(`insert into categories (name) values ('Minha categoria')`)))), 'não cria categoria');
ok((await as(U1, () => sql(`update documents set title='Hackeado' returning id`))).rows.length === 0, 'não edita documento');
ok((await as(U1, () => sql(`delete from documents returning id`))).rows.length === 0, 'não exclui documento');
ok(!!(await as(U1, () => fails(() => sql(`update profiles set role='admin' where id=$1`, [U1])))), 'não escala o próprio perfil para admin');
ok(!!(await as(U1, () => fails(() => sql(`insert into profiles (id,username,full_name,role) values (gen_random_uuid(),'x1x','Xx','admin')`)))), 'não cria perfis');
ok((await as(U1, () => sql('select * from content_history'))).rows.length === 0, 'não lê histórico');
ok((await as(U1, () => sql(`select * from storage.objects`))).rows.length === 0, 'storage vazio');
ok(!!(await as(U1, () => fails(() => sql(`insert into storage.objects (bucket_id,name) values ('documentos','x.pdf')`)))), 'não envia arquivo ao storage');

console.log('FAQ colaborativo');
const q1 = (await as(U1, () => sql(`insert into faq_items (question, answer, status) values ('Como cadastrar uma conexão?','Resposta da Ana','published') returning *`))).rows[0];
ok(q1.status === 'pending', 'usuário não consegue criar FAQ já publicada (vira pending)');
ok(q1.created_by === U1, 'autoria carimbada pelo servidor');
ok((await as(U2, () => sql('select * from faq_items'))).rows.length === 0, 'outro usuário não vê pergunta pendente');
ok((await as(U1, () => sql('select * from faq_items'))).rows.length === 1, 'autor vê a própria pendente');
ok((await as(ADM, () => sql('select * from faq_items'))).rows.length === 1, 'admin vê pendentes');
const upd = (await as(U1, () => sql(`update faq_items set status='published', answer='Editada pela Ana' where id=$1 returning *`, [q1.id]))).rows[0];
ok(upd.status === 'pending' && upd.answer === 'Editada pela Ana', 'autor edita enquanto pendente mas não se auto-aprova');
ok((await as(ADM, () => sql(`update faq_items set status='published' where id=$1 returning *`, [q1.id]))).rows[0].reviewed_by === ADM, 'admin aprova e fica registrado quem revisou');
ok((await as(U2, () => sql('select * from faq_items'))).rows.length === 1, 'após aprovação todos veem');
ok((await as(U1, () => sql(`update faq_items set answer='x' where id=$1 returning id`, [q1.id]))).rows.length === 0, 'autor não edita pergunta já publicada');
ok((await as(U2, () => sql(`delete from faq_items where id=$1 returning id`, [q1.id]))).rows.length === 0, 'outro usuário não exclui');
ok(!!(await as(ADM, () => fails(() => sql(`insert into faq_items (question,status) values ('Publicada sem resposta?','published')`)))), 'publicada exige resposta');
const doc = (await sql('select id from documents limit 1')).rows[0].id;
await as(ADM, () => sql(`insert into faq_item_documents values ($1,$2)`, [q1.id, doc]));
ok((await as(U2, () => sql('select * from faq_item_documents'))).rows.length === 1, 'vínculo FAQ→documento visível');
ok(!!(await as(U2, () => fails(() => sql(`insert into faq_item_documents values ($1,$2)`, [q1.id, doc])))), 'usuário não vincula em item alheio');
// recusada e reenviada
const q2 = (await as(U2, () => sql(`insert into faq_items (question) values ('Pergunta sem resposta ainda?') returning *`))).rows[0];
await as(ADM, () => sql(`update faq_items set status='rejected', review_note='Detalhe melhor' where id=$1`, [q2.id]));
const re = (await as(U2, () => sql(`update faq_items set question='Pergunta reescrita com mais detalhe?' where id=$1 returning *`, [q2.id]))).rows[0];
ok(re.status === 'pending' && re.review_note === null, 'pergunta recusada volta a pending ao ser reeditada');
ok((await as(U2, () => sql(`delete from faq_items where id=$1 returning id`, [q2.id]))).rows.length === 1, 'autor exclui a própria pendente');

console.log('Sugestões');
const s1 = (await as(U1, () => sql(`insert into suggestions (kind,title,status) values ('document','Incluir ata da reunião','accepted') returning *`))).rows[0];
ok(s1.status === 'open', 'sugestão sempre nasce aberta');
ok((await as(U2, () => sql('select * from suggestions'))).rows.length === 0, 'não vê sugestões alheias');
ok((await as(U1, () => sql(`update suggestions set status='accepted' where id=$1 returning id`, [s1.id]))).rows.length === 0, 'autor não resolve a própria sugestão');
const sr = (await as(ADM, () => sql(`update suggestions set status='accepted', admin_note='Ok' where id=$1 returning *`, [s1.id]))).rows[0];
ok(sr.resolved_by === ADM && sr.resolved_at, 'admin resolve e fica registrado');

console.log('Administrador');
const nd = (await as(ADM, () => sql(`insert into documents (title,type_key,source_kind,storage_path,file_name,tags) values ('Relatório Executivo v0.4','pdf','file','abc/rel.pdf','Relatório.pdf',array['relatório']) returning *`))).rows[0];
ok(nd.created_by === ADM, 'admin cria documento (arquivo)');
ok(!!(await as(ADM, () => fails(() => sql(`insert into documents (title,type_key,source_kind,storage_path,external_url) values ('Inconsistente','pdf','file','a/b.pdf','https://x.com')`)))), 'arquivo + link ao mesmo tempo é rejeitado');
ok(!!(await as(ADM, () => fails(() => sql(`insert into documents (title,type_key,source_kind,external_url) values ('Link inválido','pdf','link','javascript:alert(1)')`)))), 'URL não-http é rejeitada');
ok((await as(ADM, () => sql(`insert into storage.objects (bucket_id,name) values ('documentos','abc/rel.pdf') returning id`))).rows.length === 1, 'admin envia arquivo');
ok((await as(U1, () => sql(`select * from storage.objects`))).rows.length === 1, 'usuário comum lê o arquivo');
const cat = (await as(ADM, () => sql(`insert into categories (name) values ('Atas') returning *`))).rows[0];
const sub = (await as(ADM, () => sql(`insert into categories (name, parent_id) values ('Reuniões', $1) returning *`, [cat.id]))).rows[0];
ok(!!sub, 'cria subcategoria');
ok(!!(await as(ADM, () => fails(() => sql(`insert into categories (name, parent_id) values ('Neta', $1)`, [sub.id])))), 'bloqueia 3º nível');
ok(!!(await as(ADM, () => fails(() => sql(`insert into categories (name) values ('atas')`)))), 'nome de categoria único (sem diferenciar maiúsculas)');
await as(ADM, () => sql(`delete from categories where id=$1`, [cat.id]));
ok((await sql(`select count(*)::int n from categories where id=$1`, [sub.id])).rows[0].n === 0, 'excluir categoria remove subcategorias');

console.log('Busca e histórico');
ok((await as(U1, () => sql(`select id from documents where search_text ilike '%conexoes%'`))).rows.length >= 2, 'busca sem acento encontra "conexões"');
ok((await as(U1, () => sql(`select id from documents where search_text ilike '%relatorio%'`))).rows.length === 1, 'busca por nome do arquivo/tag acentuada');
const hist = (await as(ADM, () => sql(`select * from content_history order by id`))).rows;
ok(hist.some(h => h.entity_type === 'faq' && h.action === 'update' && h.detail?.includes('pending → published')), 'histórico registra aprovação do FAQ');
ok(hist.some(h => h.entity_type === 'document' && h.action === 'create' && h.actor_username === 'admin'), 'histórico registra criação com autor');
ok(hist.some(h => h.entity_type === 'category' && h.action === 'delete'), 'histórico registra exclusão');
const st = (await as(U1, () => sql(`select * from category_stats`))).rows;
ok(st.length === 7 && st.reduce((a, r) => a + Number(r.documents), 0) === 4, 'category_stats consistente');

console.log(`\n${passed} verificações ok, ${failed} falhas`);
process.exit(failed ? 1 : 0);
