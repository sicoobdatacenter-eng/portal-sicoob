import { Link, useSearchParams } from 'react-router-dom';
import { HelpCircle, Layers, Search as SearchIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCatalog } from '../lib/catalog';
import { iconFor } from '../lib/icons';
import { fmtDate, likeTerm, norm } from '../lib/utils';
import type { DocumentRow, FaqItem } from '../lib/types';
import { DocTile, sourceLabel } from '../components/DocumentCard';
import { EmptyState, Loading, PageHead, useAsync } from '../components/ui';

export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const { categories, typeOf, catName } = useCatalog();

  const res = useAsync(async () => {
    const term = likeTerm(q);
    if (!term) return { docs: [], faqs: [] };
    const words = term.split(' ');
    let dq = supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(20);
    let fq = supabase.from('faq_items').select('*').order('updated_at', { ascending: false }).limit(20);
    for (const w of words) { dq = dq.ilike('search_text', `%${w}%`); fq = fq.ilike('search_text', `%${w}%`); }
    const [d, f] = await Promise.all([dq, fq]);
    if (d.error || f.error) throw new Error('Não foi possível pesquisar agora.');
    return { docs: d.data as DocumentRow[], faqs: f.data as FaqItem[] };
  }, [q]);

  const cats = categories.filter((c) => q && norm(c.name + ' ' + (c.description ?? '')).includes(norm(q)));
  const total = (res.data?.docs.length ?? 0) + (res.data?.faqs.length ?? 0) + cats.length;

  return (
    <>
      <PageHead title={q ? `Resultados para “${q}”` : 'Pesquisa'}>{q ? 'Documentos, perguntas e categorias que combinam com a sua busca.' : 'Digite algo na barra de pesquisa acima.'}</PageHead>
      {!q ? <EmptyState icon={<SearchIcon size={30} />} title="O que você quer encontrar?">Pesquise por título, assunto, palavra-chave ou trecho de uma resposta.</EmptyState>
        : res.loading ? <Loading /> : res.error ? <div className="form-error" role="alert">{res.error}</div> : total === 0 ? (
          <EmptyState icon={<SearchIcon size={30} />} title="Nada encontrado" action={<Link className="btn btn--teal" to={`/faq`}>Fazer uma pergunta no FAQ</Link>}>
            Tente outras palavras. Se a dúvida é nova, envie-a pelo FAQ para o administrador responder.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 28 }}>
            {res.data!.docs.length > 0 && (
              <section aria-labelledby="s-docs">
                <div className="section-head"><h2 id="s-docs">Documentos ({res.data!.docs.length})</h2><Link className="link-btn" to={`/documentos?q=${encodeURIComponent(q)}`}>Filtrar na biblioteca</Link></div>
                <div className="card list">
                  {res.data!.docs.map((d) => (
                    <Link key={d.id} to={`/documentos/${d.id}`} className="list-item">
                      <DocTile typeKey={d.type_key} size={18} />
                      <div style={{ minWidth: 0 }}><div className="t">{d.title}</div><div className="s">{typeOf(d.type_key)?.label}, {sourceLabel(d)}{catName(d.category_id) ? `, ${catName(d.category_id)}` : ''}, {fmtDate(d.created_at)}</div></div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {res.data!.faqs.length > 0 && (
              <section aria-labelledby="s-faq">
                <div className="section-head"><h2 id="s-faq">Perguntas ({res.data!.faqs.length})</h2></div>
                <div className="card list">
                  {res.data!.faqs.map((f) => (
                    <Link key={f.id} to={`/faq?status=${f.status}&q=${encodeURIComponent(f.question)}`} className="list-item">
                      <div className="tile tone-green" style={{ width: 38, height: 38 }}><HelpCircle size={18} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{f.question}{f.status !== 'published' && <span className="chip chip--warn" style={{ marginLeft: 8 }}>{f.status === 'pending' ? 'Aguardando revisão' : 'Recusada'}</span>}</div>
                        {f.answer && <div className="s" style={{ overflowWrap: 'anywhere' }}>{f.answer.length > 140 ? f.answer.slice(0, 140) + '…' : f.answer}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {cats.length > 0 && (
              <section aria-labelledby="s-cats">
                <div className="section-head"><h2 id="s-cats">Categorias ({cats.length})</h2></div>
                <div className="card list">
                  {cats.map((c) => { const I = iconFor(c.icon); return (
                    <Link key={c.id} to={`/documentos?cat=${c.id}`} className="list-item">
                      <div className="tile tone-petrol" style={{ width: 38, height: 38 }}><I size={18} /></div>
                      <div><div className="t">{c.name}</div>{c.description && <div className="s">{c.description}</div>}</div>
                      <Layers size={16} style={{ marginLeft: 'auto' }} aria-hidden="true" />
                    </Link>
                  ); })}
                </div>
              </section>
            )}
          </div>
        )}
    </>
  );
}
