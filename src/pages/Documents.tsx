import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileStack, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { likeTerm } from '../lib/utils';
import type { DocumentRow } from '../lib/types';
import { DocumentCard } from '../components/DocumentCard';
import { CategorySelect } from '../components/Selects';
import { DocumentForm } from '../components/forms';
import { EmptyState, Loading, PageHead, useDebounced, useToast } from '../components/ui';

const PAGE = 24;

export function Documents() {
  const { isAdmin } = useAuth();
  const { docTypes, withChildren, refresh, catName } = useCatalog();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const type = params.get('tipo') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q, 300);
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  useEffect(() => { setParam('q', dq.trim()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dq]);

  async function load(from: number, append: boolean) {
    setLoading(true); setError(null);
    let query = supabase.from('documents').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    if (cat) query = query.in('category_id', withChildren(cat));
    if (type) query = query.eq('type_key', type);
    const term = likeTerm(dq);
    if (term) for (const w of term.split(' ')) query = query.ilike('search_text', `%${w}%`);
    const { data, count, error: err } = await query;
    if (err) { setError('Não foi possível carregar os documentos.'); setLoading(false); return; }
    setItems((prev) => (append ? [...prev, ...(data as DocumentRow[])] : (data as DocumentRow[])));
    setTotal(count ?? 0);
    setLoading(false);
  }
  useEffect(() => { load(0, false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cat, type, dq, tick]);

  const filtered = Boolean(cat || type || dq.trim());

  return (
    <>
      <PageHead title="Documentos e entregáveis" actions={isAdmin && <button className="btn btn--teal" onClick={() => setAdding(true)}><Plus size={18} /> Adicionar documento</button>}>
        {cat ? `Categoria: ${catName(cat) ?? '…'}.` : 'Tudo o que o projeto produziu: arquivos para baixar e links para Figma, draw.io e Google Drive.'}
      </PageHead>

      <div className="toolbar">
        <div className="search">
          <Search size={18} aria-hidden="true" />
          <input className="input" type="search" placeholder="Buscar por título, descrição ou palavra-chave" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documentos" />
        </div>
        <CategorySelect value={cat} onChange={(v) => setParam('cat', v)} allLabel="Todas as categorias" />
      </div>
      <div className="filters" role="group" aria-label="Filtrar por tipo de material">
        <button className="pill" aria-pressed={!type} onClick={() => setParam('tipo', '')}>Todos os tipos</button>
        {docTypes.map((t) => <button key={t.key} className="pill" aria-pressed={type === t.key} onClick={() => setParam('tipo', type === t.key ? '' : t.key)}>{t.label}</button>)}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {!error && <p className="result-count" aria-live="polite">{loading && items.length === 0 ? 'Carregando…' : `${total} ${total === 1 ? 'documento' : 'documentos'}${filtered ? ' com esses filtros' : ''}`}</p>}

      {loading && items.length === 0 ? <Loading /> : items.length === 0 && !error ? (
        <EmptyState icon={<FileStack size={30} />} title={filtered ? 'Nada encontrado com esses filtros' : 'O repositório ainda está vazio'}
          action={filtered ? <button className="btn btn--ghost" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Limpar filtros</button> : isAdmin ? <button className="btn btn--teal" onClick={() => setAdding(true)}><Plus size={18} /> Adicionar documento</button> : undefined}>
          {filtered ? 'Tente outras palavras ou remova algum filtro. Se o material deveria existir, sugira-o em Contribuições.' : isAdmin ? 'Cadastre o primeiro arquivo ou link.' : 'Os materiais do projeto aparecerão aqui.'}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid--cards">{items.map((d) => <DocumentCard key={d.id} doc={d} />)}</div>
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button className="btn btn--ghost" onClick={() => load(items.length, true)} disabled={loading}>{loading ? 'Carregando…' : `Mostrar mais (${total - items.length})`}</button>
            </div>
          )}
        </>
      )}

      {adding && <DocumentForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast.ok('Documento adicionado.'); refresh(); setTick((t) => t + 1); }} />}
    </>
  );
}
