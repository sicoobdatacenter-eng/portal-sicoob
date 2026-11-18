import { useState } from 'react';
import { FilePlus2, FolderPen, History as HistoryIcon, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDateTime } from '../lib/utils';
import type { HistoryRow } from '../lib/types';
import { EmptyState, Loading, PageHead, useAsync } from '../components/ui';

const ENTITY: Record<string, string> = { document: 'Documento', category: 'Categoria', faq: 'Pergunta do FAQ' };
const ACTION: Record<string, string> = { create: 'criou', update: 'atualizou', delete: 'excluiu' };
const FIELD: Record<string, string> = {
  title: 'título', description: 'descrição', category_id: 'categoria', type_key: 'tipo', source_kind: 'origem', storage_path: 'arquivo',
  file_name: 'nome do arquivo', file_size: 'tamanho', mime_type: 'formato', external_url: 'link', external_provider: 'provedor', tags: 'palavras-chave',
  question: 'pergunta', answer: 'resposta', status: 'situação', review_note: 'motivo da revisão', name: 'nome', parent_id: 'categoria principal', icon: 'ícone', sort_order: 'ordem',
};

export function History() {
  const [type, setType] = useState('');
  const q = useAsync(async () => {
    let query = supabase.from('content_history').select('*').order('id', { ascending: false }).limit(200);
    if (type) query = query.eq('entity_type', type);
    const { data, error } = await query;
    if (error) throw error;
    return data as HistoryRow[];
  }, [type]);

  return (
    <>
      <PageHead title="Histórico de alterações">Quem criou, alterou ou excluiu documentos, categorias e perguntas do FAQ. Mostra as 200 ações mais recentes.</PageHead>
      <div className="filters" role="group" aria-label="Filtrar por tipo de conteúdo">
        {[['', 'Tudo'], ['document', 'Documentos'], ['faq', 'FAQ'], ['category', 'Categorias']].map(([k, l]) => (
          <button key={k} className="pill" aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>
        ))}
      </div>
      {q.loading ? <Loading /> : q.error ? <div className="form-error" role="alert">{q.error}</div> : q.data!.length === 0 ? (
        <EmptyState icon={<HistoryIcon size={30} />} title="Nenhuma alteração registrada">As próximas criações, edições e exclusões aparecem aqui.</EmptyState>
      ) : (
        <div className="card timeline">
          {q.data!.map((h) => {
            const Icon = h.action === 'create' ? FilePlus2 : h.action === 'delete' ? Trash2 : FolderPen;
            const tone = h.action === 'create' ? 'tone-green' : h.action === 'delete' ? 'tone-petrol' : 'tone-teal';
            return (
              <div key={h.id} className="tl-item">
                <div className={`tile ${tone}`}><Icon size={18} /></div>
                <div>
                  <div className="t"><b>{h.actor_username ? `@${h.actor_username}` : 'Sistema'}</b> {ACTION[h.action]} {ENTITY[h.entity_type]?.toLowerCase() ?? h.entity_type} <b>{h.entity_title ?? '(sem título)'}</b></div>
                  <div className="s">
                    {fmtDateTime(h.created_at)}
                    {h.changed_fields.length > 0 && ` · campos: ${h.changed_fields.map((f) => FIELD[f] ?? f).join(', ')}`}
                    {h.detail && ` · ${h.detail.replace('pending', 'aguardando').replace('published', 'publicada').replace('rejected', 'recusada')}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
