import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, FilePlus2, FileText, HelpCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { errMsg, fmtDate, likeTerm, norm } from '../lib/utils';
import type { DocumentRow, FaqItem, FaqStatus } from '../lib/types';
import { CategorySelect } from '../components/Selects';
import { FaqForm, SuggestionForm } from '../components/forms';
import { ConfirmDialog, EmptyState, Field, Loading, Modal, useDebounced, useToast } from '../components/ui';

/** Texto da resposta: preserva quebras de linha e transforma endereços http(s) em links, sem HTML. */
export function Answer({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    parts.push(<a key={i++} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <div className="answer">{parts}</div>;
}

export function RejectModal({ item, onClose, onDone }: { item: FaqItem; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { error } = await supabase.from('faq_items').update({ status: 'rejected', review_note: note.trim() || null }).eq('id', item.id);
    if (error) { setBusy(false); return toast.error(errMsg(error)); }
    toast.ok('Pergunta recusada.');
    onDone();
  }
  return (
    <Modal title="Recusar pergunta" onClose={onClose} narrow closeDisabled={busy}
      footer={<><button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn btn--danger" onClick={go} disabled={busy}>{busy ? 'Aguarde…' : 'Recusar'}</button></>}>
      <p style={{ marginBottom: 14 }}>“{item.question}”</p>
      <Field label="Motivo (o autor vai ler)" htmlFor="rj-note"><textarea id="rj-note" className="textarea" style={{ minHeight: 90 }} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

const STATUS_LABEL: Record<FaqStatus, string> = { published: 'Publicada', pending: 'Aguardando revisão', rejected: 'Recusada' };

export function FaqEntry({ item, docs, open, onToggle, onChanged, onSuggest }: {
  item: FaqItem; docs: Map<string, DocumentRow>; open: boolean; onToggle: () => void; onChanged: () => void; onSuggest: (i: FaqItem) => void;
}) {
  const { isAdmin, profile } = useAuth();
  const { catName, personName } = useCatalog();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = item.created_by === profile?.id;
  const canEdit = isAdmin || (mine && item.status !== 'published');
  const linked = (item.faq_item_documents ?? []).map((l) => docs.get(l.document_id)).filter((d): d is DocumentRow => !!d);

  async function approve() {
    if (!item.answer?.trim()) return setEditing(true);
    setBusy(true);
    const { error } = await supabase.from('faq_items').update({ status: 'published' }).eq('id', item.id);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.ok('Pergunta publicada.');
    onChanged();
  }
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('faq_items').delete().eq('id', item.id);
    setBusy(false); setDeleting(false);
    if (error) return toast.error(errMsg(error));
    toast.ok('Pergunta excluída.');
    onChanged();
  }

  return (
    <div className="faq-item" data-open={open}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span className="qt">
          {item.question}
          <span className="qm">
            {item.status !== 'published' && <span className={`chip ${item.status === 'rejected' ? 'chip--danger' : 'chip--warn'}`}>{STATUS_LABEL[item.status]}</span>}
            {catName(item.category_id) && <span className="chip">{catName(item.category_id)}</span>}
          </span>
        </span>
        <ChevronDown size={20} className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="faq-a">
          {item.answer?.trim() ? <Answer text={item.answer} /> : <p className="answer-empty">Esta pergunta ainda não tem resposta.</p>}
          {linked.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {linked.map((d) => <Link key={d.id} className="chip chip--teal" style={{ textDecoration: 'none' }} to={`/documentos/${d.id}`}><FileText size={13} /> {d.title}</Link>)}
            </div>
          )}
          {item.status === 'rejected' && item.review_note && <div className="note"><b>Motivo da recusa:</b> {item.review_note}</div>}
          <div className="faq-foot">
            <span className="hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Enviada por {personName(item.created_by)} em {fmtDate(item.created_at)}</span>
            <span className="spacer" />
            {isAdmin && item.status === 'pending' && <>
              <button className="btn btn--small btn--teal" onClick={approve} disabled={busy}><Check size={15} /> Aprovar</button>
              <button className="btn btn--small btn--ghost" onClick={() => setRejecting(true)}><X size={15} /> Recusar</button>
            </>}
            {isAdmin && item.status === 'rejected' && <button className="btn btn--small btn--ghost" onClick={approve} disabled={busy}><Check size={15} /> Aprovar mesmo assim</button>}
            {item.status === 'published' && !isAdmin && <button className="btn btn--small btn--ghost" onClick={() => onSuggest(item)}><FilePlus2 size={15} /> Sugerir correção</button>}
            {canEdit && <button className="btn btn--small btn--ghost" onClick={() => setEditing(true)}><Pencil size={15} /> Editar</button>}
            {(isAdmin || (mine && item.status !== 'published')) && <button className="btn btn--small btn--ghost" onClick={() => setDeleting(true)}><Trash2 size={15} /> Excluir</button>}
          </div>
        </div>
      )}
      {editing && <FaqForm item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast.ok('Pergunta atualizada.'); onChanged(); }} />}
      {rejecting && <RejectModal item={item} onClose={() => setRejecting(false)} onDone={() => { setRejecting(false); onChanged(); }} />}
      {deleting && <ConfirmDialog title="Excluir pergunta" confirmLabel="Excluir" danger busy={busy} onClose={() => setDeleting(false)} onConfirm={remove}><p>A pergunta “{item.question}” e a sua resposta serão removidas.</p></ConfirmDialog>}
    </div>
  );
}

export function Faq() {
  const { isAdmin, profile } = useAuth();
  const { withChildren, catName } = useCatalog();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const status = (params.get('status') as FaqStatus | 'mine' | null) ?? 'published';
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q, 300);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [docs, setDocs] = useState<Map<string, DocumentRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [suggesting, setSuggesting] = useState<FaqItem | null>(null);
  const [tick, setTick] = useState(0);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      let query = supabase.from('faq_items').select('*, faq_item_documents(document_id)').order('updated_at', { ascending: false }).limit(300);
      if (status === 'mine') query = query.eq('created_by', profile!.id).neq('status', 'published');
      else query = query.eq('status', status);
      if (cat) query = query.in('category_id', withChildren(cat));
      const term = likeTerm(dq);
      if (term) for (const w of term.split(' ')) query = query.ilike('search_text', `%${w}%`);
      const [r, d] = await Promise.all([query, supabase.from('documents').select('*')]);
      if (!alive) return;
      if (r.error) { setError('Não foi possível carregar as perguntas.'); setLoading(false); return; }
      setItems(r.data as FaqItem[]);
      setDocs(new Map(((d.data ?? []) as DocumentRow[]).map((x) => [x.id, x])));
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, status, dq, tick]);

  // Abre direto quando a busca devolve um único resultado vindo de um link (ex.: Início)
  useEffect(() => {
    const incoming = params.get('q');
    if (incoming && items.length >= 1 && !openId) {
      const exact = items.find((i) => norm(i.question) === norm(incoming));
      if (exact) setOpenId(exact.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const reload = () => { setTick((t) => t + 1); window.dispatchEvent(new Event('portal:pending-changed')); };
  const tabs = useMemo(() => {
    const t: { key: string; label: string }[] = [{ key: 'published', label: 'Respondidas' }];
    if (isAdmin) { t.push({ key: 'pending', label: 'Aguardando revisão' }, { key: 'rejected', label: 'Recusadas' }); }
    else t.push({ key: 'mine', label: 'Minhas pendentes' });
    return t;
  }, [isAdmin]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Perguntas frequentes</h1>
          <p>Uma base construída pela equipe do projeto. Não achou sua dúvida? Pergunte, e o administrador publica a resposta.</p>
        </div>
        <div className="page-actions"><button className="btn btn--teal" onClick={() => setCreating(true)}><Plus size={18} /> Nova pergunta</button></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search size={18} aria-hidden="true" />
          <input className="input" type="search" placeholder="Buscar nas perguntas e respostas" value={q}
            onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value.trim()); }} aria-label="Buscar no FAQ" />
        </div>
        <CategorySelect value={cat} onChange={(v) => setParam('cat', v)} allLabel="Todas as categorias" />
      </div>
      <div className="filters" role="group" aria-label="Situação das perguntas">
        {tabs.map((t) => <button key={t.key} className="pill" aria-pressed={status === t.key} onClick={() => setParam('status', t.key === 'published' ? '' : t.key)}>{t.label}</button>)}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <Loading /> : items.length === 0 && !error ? (
        <EmptyState icon={<HelpCircle size={30} />}
          title={dq.trim() ? 'Nenhuma pergunta encontrada' : status === 'published' ? 'Ainda não há perguntas respondidas' : 'Nada por aqui'}
          action={<button className="btn btn--teal" onClick={() => setCreating(true)}><Plus size={18} /> {dq.trim() ? 'Perguntar isto' : 'Fazer uma pergunta'}</button>}>
          {dq.trim() ? `Nada sobre “${dq.trim()}”${cat ? ` em ${catName(cat)}` : ''}. Envie como nova pergunta para o administrador responder.` : 'Quando houver perguntas nesta situação, elas aparecem aqui.'}
        </EmptyState>
      ) : (
        <>
          <p className="result-count" aria-live="polite">{items.length} {items.length === 1 ? 'pergunta' : 'perguntas'}</p>
          <div className="accordion">
            {items.map((i) => <FaqEntry key={i.id} item={i} docs={docs} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} onChanged={reload} onSuggest={setSuggesting} />)}
          </div>
        </>
      )}

      {creating && <FaqForm defaultQuestion={dq.trim().length >= 5 ? dq.trim() : undefined} defaultCategory={cat || undefined} onClose={() => setCreating(false)}
        onSaved={(pending) => { setCreating(false); toast.ok(pending ? (isAdmin ? 'Pergunta salva para revisão.' : 'Pergunta enviada. Ela aparece no FAQ depois da aprovação.') : 'Pergunta publicada.'); reload(); }} />}
      {suggesting && <SuggestionForm faq={suggesting} onClose={() => setSuggesting(null)} onSaved={() => { setSuggesting(null); toast.ok('Sugestão enviada ao administrador.'); }} />}
    </>
  );
}
