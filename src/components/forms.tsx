import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileUp, Link2 } from 'lucide-react';
import { supabase, BUCKET, MAX_UPLOAD_BYTES } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { ICON_KEYS, iconFor } from '../lib/icons';
import { detectProvider, errMsg, fmtBytes, isHttpUrl, safeStorageName, suggestType } from '../lib/utils';
import type { Category, DocumentRow, FaqItem, SuggestionKind } from '../lib/types';
import { CategorySelect, DocPicker } from './Selects';
import { Field, Modal, useAsync } from './ui';

/* =====================  Documento (admin)  ===================== */
export function DocumentForm({ doc, defaults, onClose, onSaved }: { doc?: DocumentRow; defaults?: { title?: string; description?: string; url?: string }; onClose: () => void; onSaved: (d: DocumentRow) => void }) {
  const { docTypes } = useCatalog();
  const [kind, setKind] = useState<'file' | 'link'>(doc?.source_kind ?? 'link');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(doc?.external_url ?? defaults?.url ?? '');
  const [title, setTitle] = useState(doc?.title ?? defaults?.title ?? '');
  const [description, setDescription] = useState(doc?.description ?? defaults?.description ?? '');
  const [category, setCategory] = useState(doc?.category_id ?? '');
  const [typeKey, setTypeKey] = useState(doc?.type_key ?? '');
  const [typeTouched, setTypeTouched] = useState(Boolean(doc));
  const [tags, setTags] = useState((doc?.tags ?? []).join(', '));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setFile(f);
    if (!f) return;
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    if (!typeTouched) setTypeKey(suggestType({ fileName: f.name, mime: f.type }) ?? typeKey);
  }
  function changeUrl(v: string) {
    setUrl(v);
    if (!typeTouched && isHttpUrl(v)) setTypeKey(suggestType({ provider: detectProvider(v).key }) ?? typeKey);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (title.trim().length < 3) return setErr('Informe um título com pelo menos 3 caracteres.');
    if (!typeKey) return setErr('Escolha o tipo de material.');
    const cleanUrl = url.trim();
    if (kind === 'link' && !isHttpUrl(cleanUrl)) return setErr('Informe um link válido, começando com http:// ou https://.');
    if (kind === 'file' && !file && doc?.source_kind !== 'file') return setErr('Selecione o arquivo para enviar.');
    if (file && file.size > MAX_UPLOAD_BYTES) return setErr(`O arquivo tem ${fmtBytes(file.size)}. O limite é ${fmtBytes(MAX_UPLOAD_BYTES)}. Para arquivos maiores, hospede no Google Drive e cadastre o link.`);

    const tagList = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 40)))].slice(0, 20);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      category_id: category || null,
      type_key: typeKey,
      tags: tagList,
    };

    setBusy(true);
    let uploaded: string | null = null;
    try {
      if (kind === 'link') {
        payload.source_kind = 'link';
        payload.external_url = cleanUrl;
        payload.external_provider = detectProvider(cleanUrl).key;
        payload.storage_path = null; payload.file_name = null; payload.file_size = null; payload.mime_type = null;
      } else if (file) {
        const path = `${crypto.randomUUID()}/${safeStorageName(file.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (up.error) throw up.error;
        uploaded = path;
        Object.assign(payload, { source_kind: 'file', storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null, external_url: null, external_provider: null });
      }

      const q = doc
        ? supabase.from('documents').update(payload).eq('id', doc.id)
        : supabase.from('documents').insert(payload);
      const { data, error } = await q.select().single();
      if (error) throw error;

      // Limpa o arquivo antigo se ele foi substituído ou trocado por link
      if (doc?.storage_path && doc.storage_path !== (data as DocumentRow).storage_path) {
        await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      }
      onSaved(data as DocumentRow);
    } catch (ex) {
      if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded]);
      setErr(errMsg(ex, 'Não foi possível salvar o documento.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={doc ? 'Editar documento' : 'Adicionar documento'} onClose={onClose} closeDisabled={busy}
      footer={<>
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" form="doc-form" disabled={busy}>{busy ? 'Salvando…' : doc ? 'Salvar alterações' : 'Adicionar ao repositório'}</button>
      </>}>
      <form id="doc-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="field">
          <span className="field-label">Como o material será disponibilizado?</span>
          <div className="segmented" role="group" aria-label="Origem do material">
            <button type="button" aria-pressed={kind === 'link'} onClick={() => setKind('link')}><Link2 size={15} style={{ verticalAlign: -2 }} /> Link externo</button>
            <button type="button" aria-pressed={kind === 'file'} onClick={() => setKind('file')}><FileUp size={15} style={{ verticalAlign: -2 }} /> Enviar arquivo</button>
          </div>
        </div>

        {kind === 'link' ? (
          <Field label="Link do material" htmlFor="d-url" hint="Figma, draw.io, Google Drive, Google Docs, YouTube ou qualquer endereço http(s).">
            <input id="d-url" className="input" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => changeUrl(e.target.value)} required />
          </Field>
        ) : (
          <Field label="Arquivo" htmlFor="d-file" hint={doc?.source_kind === 'file' && !file ? `Atual: ${doc.file_name}. Escolha outro arquivo só se quiser substituí-lo.` : `PDF, Word, Excel, vídeo e outros, até ${fmtBytes(MAX_UPLOAD_BYTES)}.`}>
            <input id="d-file" ref={fileRef} className="input" type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}

        <Field label="Título" htmlFor="d-title"><input id="d-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Descrição" htmlFor="d-desc"><textarea id="d-desc" className="textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 90 }} /></Field>
        <div className="row">
          <Field label="Categoria" htmlFor="d-cat"><CategorySelect id="d-cat" value={category} onChange={setCategory} /></Field>
          <Field label="Tipo de material" htmlFor="d-type">
            <select id="d-type" className="select" value={typeKey} onChange={(e) => { setTypeKey(e.target.value); setTypeTouched(true); }} required>
              <option value="">Selecione</option>
              {docTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Palavras-chave" htmlFor="d-tags" hint="Separe por vírgula. Ajudam a encontrar o material na pesquisa."><input id="d-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

/* =====================  FAQ  ===================== */
export function FaqForm({ item, defaultQuestion, defaultCategory, onClose, onSaved }: {
  item?: FaqItem; defaultQuestion?: string; defaultCategory?: string; onClose: () => void; onSaved: (savedAsPending: boolean) => void;
}) {
  const { isAdmin } = useAuth();
  const [question, setQuestion] = useState(item?.question ?? defaultQuestion ?? '');
  const [answer, setAnswer] = useState(item?.answer ?? '');
  const [category, setCategory] = useState(item?.category_id ?? defaultCategory ?? '');
  const [linked, setLinked] = useState<string[]>(item?.faq_item_documents?.map((l) => l.document_id) ?? []);
  const [publish, setPublish] = useState(item ? item.status !== 'rejected' : true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = useAsync(async () => {
    const { data, error } = await supabase.from('documents').select('*').order('title');
    if (error) throw error;
    return data as DocumentRow[];
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const q = question.trim();
    const a = answer.trim();
    if (q.length < 5) return setErr('Escreva a pergunta com pelo menos 5 caracteres.');
    const wantsPublish = isAdmin && publish;
    if ((wantsPublish || item?.status === 'published') && !a) return setErr('Para publicar, escreva a resposta.');

    setBusy(true);
    try {
      const payload: Record<string, unknown> = { question: q, answer: a || null, category_id: category || null };
      if (isAdmin) payload.status = wantsPublish ? 'published' : item?.status === 'published' ? 'published' : item?.status ?? 'pending';
      const res = item
        ? await supabase.from('faq_items').update(payload).eq('id', item.id).select().single()
        : await supabase.from('faq_items').insert(payload).select().single();
      if (res.error) throw res.error;
      const saved = res.data as FaqItem;

      const before = item?.faq_item_documents?.map((l) => l.document_id) ?? [];
      const toAdd = linked.filter((id) => !before.includes(id));
      const toDel = before.filter((id) => !linked.includes(id));
      if (toDel.length) {
        const r = await supabase.from('faq_item_documents').delete().eq('faq_item_id', saved.id).in('document_id', toDel);
        if (r.error) throw r.error;
      }
      if (toAdd.length) {
        const r = await supabase.from('faq_item_documents').insert(toAdd.map((document_id) => ({ faq_item_id: saved.id, document_id })));
        if (r.error) throw r.error;
      }
      onSaved(saved.status !== 'published');
    } catch (ex) {
      setErr(errMsg(ex, 'Não foi possível salvar a pergunta.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={item ? 'Editar pergunta' : 'Nova pergunta'} onClose={onClose} closeDisabled={busy}
      footer={<>
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" form="faq-form" disabled={busy}>{busy ? 'Salvando…' : item ? 'Salvar alterações' : isAdmin ? 'Salvar pergunta' : 'Enviar para revisão'}</button>
      </>}>
      <form id="faq-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        {item?.status === 'rejected' && item.review_note && <div className="note" style={{ marginBottom: 14 }}><b>Motivo da recusa:</b> {item.review_note}</div>}
        <Field label="Pergunta" htmlFor="f-q"><input id="f-q" className="input" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} required /></Field>
        <Field label={isAdmin ? 'Resposta' : 'Resposta (opcional)'} htmlFor="f-a"
          hint={isAdmin ? undefined : 'Se não souber a resposta, envie só a pergunta: o administrador poderá respondê-la.'}>
          <textarea id="f-a" className="textarea" value={answer} maxLength={10000} onChange={(e) => setAnswer(e.target.value)} />
        </Field>
        <Field label="Categoria" htmlFor="f-cat"><CategorySelect id="f-cat" value={category} onChange={setCategory} /></Field>
        <div className="field">
          <span className="field-label">Materiais relacionados</span>
          {docs.loading ? <span className="hint">Carregando documentos…</span> : <DocPicker docs={docs.data ?? []} selected={linked} onChange={setLinked} />}
        </div>
        {isAdmin ? (
          <label className="check"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /><span>Publicar para todos os usuários</span></label>
        ) : (
          <p className="hint">Sua contribuição aparece no FAQ depois que o administrador aprovar.</p>
        )}
      </form>
    </Modal>
  );
}

/* =====================  Categoria (admin)  ===================== */
export function CategoryForm({ category, defaultParent, onClose, onSaved }: { category?: Category; defaultParent?: string; onClose: () => void; onSaved: () => void }) {
  const { categories } = useCatalog();
  const hasChildren = category ? categories.some((c) => c.parent_id === category.id) : false;
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [parent, setParent] = useState(category?.parent_id ?? defaultParent ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'folder');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr('Informe o nome da categoria.');
    setBusy(true); setErr(null);
    const payload = { name: name.trim(), description: description.trim() || null, parent_id: parent || null, icon };
    const maxOrder = Math.max(0, ...categories.map((c) => c.sort_order));
    const r = category
      ? await supabase.from('categories').update(payload).eq('id', category.id)
      : await supabase.from('categories').insert({ ...payload, sort_order: maxOrder + 10 });
    if (r.error) { setErr(errMsg(r.error)); setBusy(false); return; }
    onSaved();
  }
  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} closeDisabled={busy}
      footer={<>
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" form="cat-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar categoria'}</button>
      </>}>
      <form id="cat-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label="Nome" htmlFor="c-name"><input id="c-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Descrição" htmlFor="c-desc"><textarea id="c-desc" className="textarea" style={{ minHeight: 80 }} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Categoria principal" htmlFor="c-parent" hint={hasChildren ? 'Esta categoria já tem subcategorias, por isso não pode virar subcategoria.' : 'Deixe em branco para criar uma categoria principal.'}>
          <select id="c-parent" className="select" value={parent} onChange={(e) => setParent(e.target.value)} disabled={hasChildren}>
            <option value="">Nenhuma (categoria principal)</option>
            {categories.filter((c) => !c.parent_id && c.id !== category?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Ícone</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label="Ícone da categoria">
            {ICON_KEYS.map((k) => {
              const I = iconFor(k);
              return (
                <button key={k} type="button" role="radio" aria-checked={icon === k} aria-label={k} onClick={() => setIcon(k)}
                  className={`btn btn--icon ${icon === k ? '' : 'btn--ghost'}`}><I size={18} /></button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* =====================  Sugestão de conteúdo  ===================== */
export function SuggestionForm({ faq, defaultKind, onClose, onSaved }: { faq?: FaqItem; defaultKind?: SuggestionKind; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<SuggestionKind>(faq ? 'faq_correction' : defaultKind ?? 'document');
  const [title, setTitle] = useState(faq ? `Correção: ${faq.question}`.slice(0, 200) : '');
  const [details, setDetails] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { /* mantém o foco no primeiro campo pelo Modal */ }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return setErr('Dê um título com pelo menos 3 caracteres.');
    if (url.trim() && !isHttpUrl(url.trim())) return setErr('O link precisa começar com http:// ou https://.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('suggestions').insert({
      kind, title: title.trim(), details: details.trim() || null, url: url.trim() || null, faq_item_id: faq?.id ?? null,
    });
    if (error) { setErr(errMsg(error)); setBusy(false); return; }
    onSaved();
  }
  return (
    <Modal title={faq ? 'Sugerir correção da resposta' : 'Sugerir conteúdo'} onClose={onClose} closeDisabled={busy}
      footer={<>
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" form="sug-form" disabled={busy}>{busy ? 'Enviando…' : 'Enviar sugestão'}</button>
      </>}>
      <form id="sug-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        {!faq && (
          <Field label="O que você quer sugerir?" htmlFor="s-kind">
            <select id="s-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as SuggestionKind)}>
              <option value="document">Um novo material para o repositório</option>
              <option value="other">Outro conteúdo ou tema para a base de conhecimento</option>
            </select>
          </Field>
        )}
        <Field label="Título" htmlFor="s-title"><input id="s-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Detalhes" htmlFor="s-det" hint={faq ? 'Explique o que está errado ou desatualizado e o que deveria constar.' : 'Conte o que é o material e por que ele ajudaria.'}>
          <textarea id="s-det" className="textarea" value={details} maxLength={3000} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <Field label="Link (opcional)" htmlFor="s-url"><input id="s-url" className="input" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
