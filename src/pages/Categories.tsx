import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { iconFor, toneForIndex } from '../lib/icons';
import { errMsg } from '../lib/utils';
import type { Category } from '../lib/types';
import { CategoryForm } from '../components/forms';
import { ConfirmDialog, EmptyState, Loading, PageHead, useToast } from '../components/ui';

export function Categories() {
  const { isAdmin } = useAuth();
  const { categories, stats, refresh, loading } = useCatalog();
  const toast = useToast();
  const [form, setForm] = useState<{ cat?: Category; parent?: string } | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const tops = categories.filter((c) => !c.parent_id);
  const subs = (id: string) => categories.filter((c) => c.parent_id === id);
  const count = (id: string) => ({ d: stats.get(id)?.documents ?? 0, f: stats.get(id)?.faqs ?? 0 });
  const delInfo = del ? [del.id, ...subs(del.id).map((s) => s.id)].reduce((a, id) => ({ d: a.d + count(id).d, f: a.f + count(id).f }), { d: 0, f: 0 }) : { d: 0, f: 0 };

  async function remove() {
    if (!del) return;
    setBusy(true);
    const { error } = await supabase.from('categories').delete().eq('id', del.id);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.ok('Categoria excluída.');
    setDel(null);
    refresh();
  }

  if (loading) return <Loading />;
  return (
    <>
      <PageHead title="Categorias e assuntos" actions={isAdmin && <button className="btn btn--teal" onClick={() => setForm({})}><Plus size={18} /> Nova categoria</button>}>
        Agrupam os materiais e as perguntas por tema, processo ou etapa do projeto.
      </PageHead>

      {tops.length === 0 ? (
        <EmptyState icon={<Layers size={30} />} title="Nenhuma categoria criada" action={isAdmin ? <button className="btn btn--teal" onClick={() => setForm({})}><Plus size={18} /> Criar categoria</button> : undefined}>
          {isAdmin ? 'Crie categorias para organizar documentos e perguntas.' : 'O administrador ainda não criou categorias.'}
        </EmptyState>
      ) : (
        <div className="grid grid--cards">
          {tops.map((c, i) => {
            const Icon = iconFor(c.icon); const own = count(c.id);
            return (
              <article key={c.id} className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div className={`tile ${toneForIndex(i)}`}><Icon size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '1.1rem' }}>{c.name}</h2>
                    {c.description && <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginTop: 4 }}>{c.description}</p>}
                  </div>
                </div>
                <div className="meta" style={{ marginTop: 0 }}>
                  <Link className="chip chip--teal" style={{ textDecoration: 'none' }} to={`/documentos?cat=${c.id}`}>{own.d} {own.d === 1 ? 'documento' : 'documentos'}</Link>
                  <Link className="chip chip--green" style={{ textDecoration: 'none' }} to={`/faq?cat=${c.id}`}>{own.f} {own.f === 1 ? 'pergunta' : 'perguntas'}</Link>
                </div>
                {subs(c.id).length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    {subs(c.id).map((s) => (
                      <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <Link to={`/documentos?cat=${s.id}`}>{s.name}</Link>
                        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{count(s.id).d} doc., {count(s.id).f} perg.</span>
                        {isAdmin && <span style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn--ghost btn--small btn--icon" aria-label={`Editar ${s.name}`} onClick={() => setForm({ cat: s })}><Pencil size={14} /></button>
                          <button className="btn btn--ghost btn--small btn--icon" aria-label={`Excluir ${s.name}`} onClick={() => setDel(s)}><Trash2 size={14} /></button>
                        </span>}
                      </li>
                    ))}
                  </ul>
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                    <button className="btn btn--ghost btn--small" onClick={() => setForm({ cat: c })}><Pencil size={14} /> Editar</button>
                    <button className="btn btn--ghost btn--small" onClick={() => setForm({ parent: c.id })}><Plus size={14} /> Subcategoria</button>
                    <button className="btn btn--ghost btn--small" onClick={() => setDel(c)}><Trash2 size={14} /> Excluir</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {form && <CategoryForm category={form.cat} defaultParent={form.parent} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast.ok('Categoria salva.'); refresh(); }} />}
      {del && (
        <ConfirmDialog title="Excluir categoria" confirmLabel="Excluir categoria" danger busy={busy} onClose={() => setDel(null)} onConfirm={remove}>
          <p>A categoria “{del.name}”{subs(del.id).length ? ` e suas ${subs(del.id).length} subcategorias` : ''} será excluída.</p>
          {(delInfo.d > 0 || delInfo.f > 0) && <p className="note">{delInfo.d} documento(s) e {delInfo.f} pergunta(s) ficarão sem categoria. Nenhum conteúdo é apagado.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
