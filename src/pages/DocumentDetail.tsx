import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Eye, FileQuestion, HelpCircle, Pencil, Trash2 } from 'lucide-react';
import { supabase, BUCKET } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { downloadBlob, embedUrl, errMsg, fmtBytes, fmtDateTime } from '../lib/utils';
import type { DocumentRow } from '../lib/types';
import { DocTile, sourceLabel } from '../components/DocumentCard';
import { DocumentForm } from '../components/forms';
import { ConfirmDialog, EmptyState, Loading, Spinner, useAsync, useToast } from '../components/ui';

function FilePreview({ doc }: { doc: DocumentRow }) {
  const [src, setSrc] = useState<{ kind: 'pdf' | 'image' | 'video' | 'audio'; url: string } | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'error' | 'ok'>('loading');

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      const mime = doc.mime_type ?? '';
      const ext = doc.file_name?.split('.').pop()?.toLowerCase() ?? '';
      const isPdf = mime === 'application/pdf' || ext === 'pdf';
      const isImg = mime.startsWith('image/') && !mime.includes('svg');
      const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext);
      const isAudio = mime.startsWith('audio/');
      if (!isPdf && !isImg && !isVideo && !isAudio) { setState('none'); return; }
      try {
        if (isVideo || isAudio) {
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path!, 3600);
          if (error) throw error;
          if (alive) { setSrc({ kind: isVideo ? 'video' : 'audio', url: data.signedUrl }); setState('ok'); }
        } else {
          const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path!);
          if (error) throw error;
          objectUrl = URL.createObjectURL(new Blob([data], { type: isPdf ? 'application/pdf' : data.type }));
          if (alive) { setSrc({ kind: isPdf ? 'pdf' : 'image', url: objectUrl }); setState('ok'); }
        }
      } catch { if (alive) setState('error'); }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.id, doc.storage_path, doc.mime_type, doc.file_name]);

  if (state === 'loading') return <Loading />;
  if (state === 'none') return <div className="preview-empty"><FileQuestion size={30} /><div>Este formato não tem prévia no navegador. Use o botão Baixar para abrir o arquivo.</div></div>;
  if (state === 'error' || !src) return <div className="preview-empty"><FileQuestion size={30} /><div>Não foi possível gerar a prévia. Tente baixar o arquivo.</div></div>;
  if (src.kind === 'pdf') return <iframe src={src.url} title={`Prévia de ${doc.title}`} />;
  if (src.kind === 'image') return <img src={src.url} alt={doc.title} />;
  if (src.kind === 'video') return <video src={src.url} controls preload="metadata" />;
  return <audio src={src.url} controls style={{ width: '100%', padding: 16 }} />;
}

function LinkPreview({ doc }: { doc: DocumentRow }) {
  const [show, setShow] = useState(false);
  const embed = embedUrl(doc.external_url!);
  if (!embed) {
    return (
      <div className="preview-empty">
        <ExternalLink size={30} />
        <div>{sourceLabel(doc)} não permite exibir este conteúdo aqui dentro. Abra o link em uma nova aba.</div>
        <a className="btn btn--teal" href={doc.external_url!} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Abrir em {sourceLabel(doc)}</a>
      </div>
    );
  }
  if (!show) {
    return (
      <div className="preview-empty">
        <Eye size={30} />
        <div>A prévia carrega o conteúdo direto do {sourceLabel(doc)}.</div>
        <button className="btn btn--teal" onClick={() => setShow(true)}>Carregar prévia</button>
      </div>
    );
  }
  return <iframe src={embed} title={`Prévia de ${doc.title}`} loading="lazy" referrerPolicy="no-referrer" allowFullScreen />;
}

export function DocumentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { catName, typeOf, personName, refresh } = useCatalog();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);

  const q = useAsync(async () => {
    const { data, error } = await supabase.from('documents').select('*').eq('id', id!).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const faqs = await supabase.from('faq_item_documents').select('faq_items(id, question, status)').eq('document_id', id!);
    const list = ((faqs.data ?? []) as unknown as { faq_items: { id: string; question: string; status: string } | null }[])
      .map((r) => r.faq_items).filter((f): f is { id: string; question: string; status: string } => !!f && f.status === 'published');
    return { doc: data as DocumentRow, faqs: list };
  }, [id]);

  if (q.loading) return <Loading />;
  if (q.error) return <div className="form-error" role="alert">{q.error}</div>;
  if (!q.data) {
    return <EmptyState icon={<FileQuestion size={30} />} title="Documento não encontrado" action={<Link className="btn" to="/documentos">Voltar aos documentos</Link>}>Ele pode ter sido removido ou o endereço está incorreto.</EmptyState>;
  }
  const { doc, faqs } = q.data;

  async function download() {
    setDl(true);
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path!);
    setDl(false);
    if (error || !data) return toast.error('Não foi possível baixar o arquivo.');
    downloadBlob(data, doc.file_name || 'arquivo');
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('documents').delete().eq('id', doc.id);
    if (error) { setBusy(false); setDeleting(false); return toast.error(errMsg(error)); }
    if (doc.storage_path) await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    toast.ok('Documento excluído.');
    refresh();
    nav('/documentos', { replace: true });
  }

  return (
    <>
      <div className="crumbs"><Link to="/documentos"><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Documentos</Link></div>
      <div className="page-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <DocTile typeKey={doc.type_key} size={26} />
          <div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 1.1rem + 1.6vw, 2.1rem)' }}>{doc.title}</h1>
            <div className="meta" style={{ marginTop: 8 }}>
              <span className="chip">{typeOf(doc.type_key)?.label ?? doc.type_key}</span>
              {catName(doc.category_id) && <Link className="chip chip--teal" style={{ textDecoration: 'none' }} to={`/documentos?cat=${doc.category_id}`}>{catName(doc.category_id)}</Link>}
            </div>
          </div>
        </div>
        <div className="page-actions">
          {doc.source_kind === 'file'
            ? <button className="btn btn--teal" onClick={download} disabled={dl}><Download size={17} /> {dl ? 'Baixando…' : 'Baixar'}</button>
            : <a className="btn btn--teal" href={doc.external_url!} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Abrir em {sourceLabel(doc)}</a>}
          {isAdmin && <>
            <button className="btn btn--ghost" onClick={() => setEditing(true)}><Pencil size={16} /> Editar</button>
            <button className="btn btn--ghost" onClick={() => setDeleting(true)}><Trash2 size={16} /> Excluir</button>
          </>}
        </div>
      </div>

      <div className="detail">
        <div style={{ display: 'grid', gap: 18 }}>
          {doc.description && <div className="card card-pad"><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{doc.description}</p></div>}
          <div className="card preview">
            {doc.source_kind === 'file' ? <FilePreview doc={doc} /> : <LinkPreview doc={doc} />}
          </div>
        </div>
        <aside className="card card-pad" aria-label="Informações do documento">
          <dl className="kv">
            <div><dt>Origem</dt><dd>{doc.source_kind === 'file' ? `Arquivo${doc.file_size ? `, ${fmtBytes(doc.file_size)}` : ''}` : sourceLabel(doc)}</dd></div>
            {doc.file_name && <div><dt>Nome do arquivo</dt><dd>{doc.file_name}</dd></div>}
            <div><dt>Incluído em</dt><dd>{fmtDateTime(doc.created_at)}{doc.created_by ? ` por ${personName(doc.created_by)}` : ''}</dd></div>
            {doc.updated_at !== doc.created_at && <div><dt>Última atualização</dt><dd>{fmtDateTime(doc.updated_at)}{doc.updated_by ? ` por ${personName(doc.updated_by)}` : ''}</dd></div>}
            {doc.tags.length > 0 && <div><dt>Palavras-chave</dt><dd style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{doc.tags.map((t) => <span key={t} className="chip">{t}</span>)}</dd></div>}
            <div>
              <dt>Perguntas relacionadas</dt>
              <dd>
                {faqs.length === 0 ? <span style={{ color: 'var(--muted)' }}>Nenhuma pergunta vinculada.</span> : (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {faqs.map((f) => <li key={f.id}><Link to={`/faq?q=${encodeURIComponent(f.question)}`} style={{ display: 'inline-flex', gap: 8 }}><HelpCircle size={16} style={{ flex: 'none', marginTop: 3 }} />{f.question}</Link></li>)}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      {editing && <DocumentForm doc={doc} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast.ok('Documento atualizado.'); refresh(); q.reload(); }} />}
      {deleting && (
        <ConfirmDialog title="Excluir documento" confirmLabel="Excluir documento" danger busy={busy} onClose={() => setDeleting(false)} onConfirm={remove}>
          <p>“{doc.title}” será removido do repositório{doc.source_kind === 'file' ? ' e o arquivo será apagado' : ''}. Essa ação não pode ser desfeita.</p>
          {busy && <div style={{ marginTop: 12 }}><Spinner /></div>}
        </ConfirmDialog>
      )}
    </>
  );
}
