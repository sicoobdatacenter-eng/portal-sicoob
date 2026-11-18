-- =====================================================================
-- Estrutura inicial do repositório — baseada no documento "Entregas Sprint 4".
-- Só entram itens reais: os 4 links entregues e categorias vazias que
-- aguardam os próximos materiais. Pode ser executado mais de uma vez.
-- Execute DEPOIS de 001_schema.sql.
-- =====================================================================

insert into public.categories (name, description, icon, sort_order)
select v.name, v.description, v.icon, v.sort_order
from (values
  ('Fluxogramas e mapas de processos', 'Fluxogramas BPMN das rotinas do IT Advisor.', 'workflow', 10),
  ('Protótipos e mapeamento de telas', 'Telas do sistema organizadas no Figma.', 'layout', 20),
  ('Vídeos tutoriais', 'Gravações e tutoriais para capacitação da equipe.', 'video', 30),
  ('Checklists', 'Checklists de rotina para uniformizar o registro das mudanças.', 'list-checks', 40),
  ('Relatórios e diagnósticos', 'Relatórios executivos, diagnósticos e atas do projeto.', 'file-text', 50),
  ('Glossário e referências', 'Termos do IT Advisor e materiais de apoio.', 'book-open', 60),
  ('Manuais e procedimentos', 'Manuais e procedimentos operacionais.', 'book-marked', 70)
) as v(name, description, icon, sort_order)
where not exists (
  select 1 from public.categories c where c.parent_id is null and lower(c.name) = lower(v.name)
);

insert into public.documents
  (title, description, category_id, type_key, source_kind, external_url, external_provider, tags)
select v.title, v.description,
       (select c.id from public.categories c where c.parent_id is null and c.name = v.category),
       v.type_key, 'link', v.url, v.provider, v.tags
from (values
  ('Mapeamento de telas do cadastro e do cancelamento de conexões',
   'Telas do IT Advisor percorridas nas rotinas de cadastro e de cancelamento de conexões, organizadas no Figma. Entrega da Sprint 4.',
   'Protótipos e mapeamento de telas', 'prototipo', 'figma',
   'https://www.figma.com/design/s7lfJUz9cgXO9vrYysLdbi/PSP-5-Sicoob--Mapeamento-de-Telas?node-id=0-1&p=f&t=nNwCiCp2sUJ469tJ-0',
   array['figma','telas','it advisor','conexões','sprint 4']),
  ('Fluxograma do cadastro e do cancelamento de conexões',
   'Fluxograma da jornada de cadastro e de cancelamento de conexões, desenhado no draw.io. Entrega da Sprint 4.',
   'Fluxogramas e mapas de processos', 'fluxograma', 'drawio',
   'https://app.diagrams.net/#G17lgJ1sX8Clx0daAhgwiXJ5DVOyGs1l5e#%7B%22pageId%22%3A%22v3%22%7D',
   array['draw.io','bpmn','fluxograma','conexões','sprint 4']),
  ('Vídeos tutoriais gravados',
   'Pasta do Google Drive com os vídeos tutoriais gravados no projeto. Entrega da Sprint 4.',
   'Vídeos tutoriais', 'video', 'drive',
   'https://drive.google.com/drive/folders/1BahPB0gc5Xvgfq1aEVs0lo9oI33eiDpr',
   array['vídeo','tutorial','google drive','sprint 4']),
  ('Checklists de rotina',
   'Documento com os checklists do projeto para uniformizar o registro das mudanças no data center. Entrega da Sprint 4.',
   'Checklists', 'checklist', 'gdocs',
   'https://docs.google.com/document/d/1ZxT90CsVNOQJVe_YZUZuUUjgM6cp11ck/edit',
   array['checklist','rotina','google docs','sprint 4'])
) as v(title, description, category, type_key, provider, url, tags)
where not exists (select 1 from public.documents d where d.external_url = v.url);
