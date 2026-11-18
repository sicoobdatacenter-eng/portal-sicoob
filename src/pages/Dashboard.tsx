import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FileStack, HelpCircle, Layers, MessageSquarePlus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { iconFor, toneForIndex } from '../lib/icons';
import { fmtDate } from '../lib/utils';
import type { DocumentRow, FaqItem } from '../lib/types';
import { CableHero } from '../components/Brand';
import { DocTile, sourceLabel } from '../components/DocumentCard';
import { EmptyState, Loading, useAsync } from '../components/ui';

export function Dashboard() {
  const { isAdmin, profile } = useAuth();
  const { categories, stats, catName } = useCatalog();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const data = useAsync(async () => {
    const [docs, faqs, nd, nf, pending] = await Promise.all([
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(6),
      supabase.from('faq_items').select('*').eq('status', 'published').order('updated_at', { ascending: false }).limit(5),
      supabase.from('documents').select('id', { count: 'exact', head: true }),
      supabase.from('faq_items').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      isAdmin
        ? supabase.from('faq_items').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        : Promise.resolve({ count: 0, error: null }),
    ]);
    const err = docs.error || faqs.error || nd.error || nf.error;
    if (err) throw err;
    return {
      docs: docs.data as DocumentRow[], faqs: faqs.data as FaqItem[],
      nDocs: nd.count ?? 0, nFaq: nf.count ?? 0, pending: pending.count ?? 0,
    };
  }, [isAdmin]);

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) nav(`/busca?q=${encodeURIComponent(q.trim())}`);
  }

  const tops = categories.filter((c) => !c.parent_id);
  const total = (id: string) => {
    const ids = [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)];
    return ids.reduce((acc, i) => ({ d: acc.d + (stats.get(i)?.documents ?? 0), f: acc.f + (stats.get(i)?.faqs ?? 0) }), { d: 0, f: 0 });
  };

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <CableHero />
            <h1>Portal de conhecimento do projeto Sicoob e UnB</h1>
            <p className="lead">Um só lugar para consultar as entregas, os processos e os tutoriais do projeto, e para construir, junto com a equipe, a base de perguntas e respostas.</p>
            <form className="search" role="search" onSubmit={search}>
              <Search size={18} aria-hidden="true" />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquise por um tema ou palavra" aria-label="Pesquisar no portal" />
            </form>
          </div>
          <div className="hero-stats" aria-label="Números do portal">
            <div className="stat"><div className="tile tone-teal"><FileStack size={22} /></div><div><b>{data.data?.nDocs ?? '–'}</b><span>documentos disponíveis</span></div></div>
            <div className="stat"><div className="tile tone-green"><HelpCircle size={22} /></div><div><b>{data.data?.nFaq ?? '–'}</b><span>perguntas respondidas</span></div></div>
            <div className="stat"><div className="tile tone-lime"><Layers size={22} /></div><div><b>{tops.length}</b><span>categorias</span></div></div>
          </div>
        </div>
        <p className="about"><strong>Sobre o projeto:</strong> jornada do usuário da equipe de cabeamento no novo sistema de gestão de data center do Sicoob (IT Advisor), desenvolvida na disciplina Projeto de Sistema de Produção 5 (PSP5), de Engenharia de Produção da UnB, em 2026.2.</p>
      </section>

      {isAdmin && data.data && data.data.pending > 0 && (
        <div className="banner" style={{ marginTop: 18, marginBottom: 0 }}>
          <MessageSquarePlus size={18} />
          <span><b>{data.data.pending}</b> {data.data.pending === 1 ? 'pergunta aguarda' : 'perguntas aguardam'} a sua revisão.</span>
          <Link to="/contribuicoes">Revisar agora</Link>
        </div>
      )}

      <section className="section" aria-labelledby="h-cats">
        <div className="section-head"><h2 id="h-cats">Navegue por categoria</h2><Link to="/categorias" className="link-btn">Ver todas</Link></div>
        {tops.length === 0 ? (
          <EmptyState icon={<Layers size={28} />} title="Nenhuma categoria ainda">
            {isAdmin ? 'Crie a primeira categoria para organizar os materiais.' : 'O administrador ainda não criou categorias.'}
          </EmptyState>
        ) : (
          <div className="grid grid--cats">
            {tops.map((c, i) => {
              const Icon = iconFor(c.icon); const t = total(c.id);
              return (
                <Link key={c.id} to={`/documentos?cat=${c.id}`} className="card cat-card">
                  <div className={`tile ${toneForIndex(i)}`}><Icon size={22} /></div>
                  <div><h3>{c.name}</h3><div className="counts">{t.d} {t.d === 1 ? 'documento' : 'documentos'}, {t.f} {t.f === 1 ? 'pergunta' : 'perguntas'}</div></div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="section two-col">
        <section aria-labelledby="h-recent">
          <div className="section-head"><h2 id="h-recent">Adicionados recentemente</h2><Link to="/documentos" className="link-btn">Ver todos</Link></div>
          {data.loading ? <Loading /> : data.error ? <div className="form-error">{data.error}</div> : data.data!.docs.length === 0 ? (
            <EmptyState title="Ainda não há documentos">{isAdmin ? 'Adicione o primeiro material na página Documentos.' : 'Os materiais do projeto aparecerão aqui.'}</EmptyState>
          ) : (
            <div className="card list">
              {data.data!.docs.map((d) => (
                <Link key={d.id} to={`/documentos/${d.id}`} className="list-item">
                  <DocTile typeKey={d.type_key} size={18} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{d.title}</div>
                    <div className="s">{sourceLabel(d)}{catName(d.category_id) ? `, ${catName(d.category_id)}` : ''}</div>
                  </div>
                  <span className="s" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="h-faq">
          <div className="section-head"><h2 id="h-faq">Perguntas frequentes</h2><Link to="/faq" className="link-btn">Abrir FAQ</Link></div>
          {data.loading ? <Loading /> : data.data && data.data.faqs.length === 0 ? (
            <EmptyState icon={<HelpCircle size={28} />} title="Nenhuma pergunta publicada" action={<Link className="btn btn--teal" to="/faq">Fazer a primeira pergunta</Link>}>
              O FAQ é construído pela equipe. {profile ? 'Envie uma dúvida ou uma resposta.' : ''}
            </EmptyState>
          ) : data.data && (
            <div className="card list">
              {data.data.faqs.map((f) => (
                <Link key={f.id} to={`/faq?q=${encodeURIComponent(f.question)}`} className="list-item">
                  <div className="tile tone-green" style={{ width: 38, height: 38 }}><HelpCircle size={18} /></div>
                  <div className="t" style={{ flex: 1 }}>{f.question}</div>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
