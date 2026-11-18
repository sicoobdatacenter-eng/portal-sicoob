import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, FilePlus2, MessageSquarePlus, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { errMsg, fmtDate } from '../lib/utils';
import type { DocumentRow, FaqItem, Suggestion } from '../lib/types';
import { DocumentForm, FaqForm, SuggestionForm } from '../components/forms';
import { FaqEntry } from './Faq';
import { EmptyState, Field, Loading, Modal, PageHead, useToast } from '../components/ui';

const KIND: Record<Suggestion['kind'], string> = { document: 'Novo material', faq_correction: 'Correção de resposta', other: 'Outro conteúdo' };
const STATUS: Record<Suggestion['status'], { label: string; cls: string }> = {
  open: { label: 'Em análise', cls: 'chip--warn' }, accepted: { label: 'Aceita', cls: 'chip--green' }, rejected: { label: 'Recusada', cls: 'chip--danger' },
};

function ResolveModal({ s, accept, onClose, onDone }: { s: Suggestion; accept: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { error } = await supabase.from('suggestions').update({ status: accept ? 'accepted' : 'rejected', admin_note: note.trim() || null }).eq('id', s.id);
    if (error) { setBusy(false); return toast.error(errMsg(error)); }
    toast.ok(accept ? 'Sugestão aceita.' : 'Sugestão recusada.');
    onDone();
  }
  return (
    <Modal title={accept ? 'Aceitar sugestão' : 'Recusar sugestão'} onClose={onClose} narrow closeDisabled={busy}
      footer={<><button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancelar</button><button className={`btn ${accept ? 'btn--teal' : 'btn--danger'}`} onClick={go} disabled={busy}>{busy ? 'Aguarde…' : accept ? 'Aceitar' : 'Recusar'}</button></>}>
      <p style={{ marginBottom: 14 }}>“{s.title}”</p>
      <Field label="Resposta para quem sugeriu (opcional)" htmlFor="rs-note"><textarea id="rs-note" className="textarea" style={{ minHeight: 90 }} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function SuggestionCard({ s, admin, onResolve, onCreateDoc }: { s: Suggestion; admin: boolean; onResolve: (s: Suggestion, accept: boolean) => void; onCreateDoc: (s: Suggestion) => void }) {
  const { personName } = useCatalog();
  const st = STATUS[s.status];
  return (
    <article className="card card-pad" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="chip">{KIND[s.kind]}</span>
        <span className={`chip ${st.cls}`}>{st.label}</span>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{admin ? `${personName(s.created_by)}, ` : ''}{fmtDate(s.created_at)}</span>
      </div>
      <h3 style={{ overflowWrap: 'anywhere' }}>{s.title}</h3>
      {s.details && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.details}</p>}
      {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}><ExternalLink size={14} style={{ verticalAlign: -2 }} /> {s.url}</a>}
      {s.faq_item_id && <Link to={`/faq?status=published`}>Ver o FAQ</Link>}
      {s.admin_note && <div className="note"><b>Retorno do administrador:</b> {s.admin_note}</div>}
      {admin && s.status === 'open' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn btn--small btn--teal" onClick={() => onResolve(s, true)}><Check size={15} /> Aceitar</button>
          <button className="btn btn--small btn--ghost" onClick={() => onResolve(s, false)}><X size={15} /> Recusar</button>
          {s.kind === 'document' && <button className="btn btn--small btn--ghost" onClick={() => onCreateDoc(s)}><FilePlus2 size={15} /> Cadastrar como documento</button>}
        </div>
      )}
    </article>
  );
}

export function Contributions() {
  const { isAdmin, profile } = useAuth();
  const { refresh } = useCatalog();
  const toast = useToast();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [docs, setDocs] = useState<Map<string, DocumentRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<'faq' | 'sug' | null>(null);
  const [resolve, setResolve] = useState<{ s: Suggestion; accept: boolean } | null>(null);
  const [newDoc, setNewDoc] = useState<Suggestion | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      let fq = supabase.from('faq_items').select('*, faq_item_documents(document_id)').order('created_at', { ascending: false }).limit(200);
      fq = isAdmin ? fq.eq('status', 'pending') : fq.eq('created_by', profile!.id).neq('status', 'published');
      let sq = supabase.from('suggestions').select('*').order('created_at', { ascending: false }).limit(200);
      if (!isAdmin) sq = sq.eq('created_by', profile!.id);
      const [f, s, d] = await Promise.all([fq, sq, supabase.from('documents').select('*')]);
      if (!alive) return;
      if (f.error || s.error) { setError('Não foi possível carregar as contribuições.'); setLoading(false); return; }
      setFaqs(f.data as FaqItem[]); setSugs(s.data as Suggestion[]);
      setDocs(new Map(((d.data ?? []) as DocumentRow[]).map((x) => [x.id, x])));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [isAdmin, profile, tick]);

  const reload = () => { setTick((t) => t + 1); window.dispatchEvent(new Event('portal:pending-changed')); };
  const openSugs = sugs.filter((s) => s.status === 'open');
  const doneSugs = sugs.filter((s) => s.status !== 'open');

  return (
    <>
      <PageHead title={isAdmin ? 'Contribuições dos usuários' : 'Minhas contribuições'}
        actions={<>
          <button className="btn btn--ghost" onClick={() => setModal('sug')}><MessageSquarePlus size={17} /> Sugerir conteúdo</button>
          <button className="btn btn--teal" onClick={() => setModal('faq')}><Plus size={17} /> Nova pergunta</button>
        </>}>
        {isAdmin ? 'Perguntas para aprovar e sugestões de novos materiais enviadas pela equipe.' : 'Acompanhe o que você enviou. Itens aprovados passam a aparecer no portal para todos.'}
      </PageHead>

      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <Loading /> : (
        <>
          <section aria-labelledby="h-faq-c">
            <div className="section-head"><h2 id="h-faq-c">{isAdmin ? 'Perguntas aguardando revisão' : 'Minhas perguntas ainda não publicadas'}</h2></div>
            {faqs.length === 0 ? (
              <EmptyState title={isAdmin ? 'Nenhuma pergunta para revisar' : 'Nenhuma pergunta pendente'}>{isAdmin ? 'Quando alguém enviar uma pergunta, ela aparece aqui.' : 'Perguntas que você enviar ficam aqui até serem aprovadas.'}</EmptyState>
            ) : (
              <div className="accordion">{faqs.map((i) => <FaqEntry key={i.id} item={i} docs={docs} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} onChanged={reload} onSuggest={() => undefined} />)}</div>
            )}
          </section>

          <section className="section" aria-labelledby="h-sug">
            <div className="section-head">
              <h2 id="h-sug">Sugestões de conteúdo</h2>
              <div className="filters" style={{ margin: 0 }} role="group" aria-label="Situação das sugestões">
                <button className="pill" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>Em análise ({openSugs.length})</button>
                <button className="pill" aria-pressed={tab === 'done'} onClick={() => setTab('done')}>Resolvidas ({doneSugs.length})</button>
              </div>
            </div>
            {(tab === 'open' ? openSugs : doneSugs).length === 0 ? (
              <EmptyState title={tab === 'open' ? 'Nenhuma sugestão em análise' : 'Nenhuma sugestão resolvida'}>Use “Sugerir conteúdo” para indicar um material ou tema que falta.</EmptyState>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {(tab === 'open' ? openSugs : doneSugs).map((s) => <SuggestionCard key={s.id} s={s} admin={isAdmin} onResolve={(x, a) => setResolve({ s: x, accept: a })} onCreateDoc={setNewDoc} />)}
              </div>
            )}
          </section>
        </>
      )}

      {modal === 'faq' && <FaqForm onClose={() => setModal(null)} onSaved={(p) => { setModal(null); toast.ok(p ? (isAdmin ? 'Pergunta salva para revisão.' : 'Pergunta enviada para revisão.') : 'Pergunta publicada.'); reload(); }} />}
      {modal === 'sug' && <SuggestionForm onClose={() => setModal(null)} onSaved={() => { setModal(null); toast.ok('Sugestão enviada ao administrador.'); reload(); }} />}
      {resolve && <ResolveModal s={resolve.s} accept={resolve.accept} onClose={() => setResolve(null)} onDone={() => { setResolve(null); reload(); }} />}
      {newDoc && <DocumentForm defaults={{ title: newDoc.title, description: newDoc.details ?? undefined, url: newDoc.url ?? undefined }} onClose={() => setNewDoc(null)} onSaved={() => { setNewDoc(null); toast.ok('Documento cadastrado. Lembre-se de aceitar a sugestão.'); refresh(); }} />}
    </>
  );
}
