-- =====================================================================
-- Tempo — schema do banco (Postgres: Supabase ou Neon via Vercel)
-- AINDA NÃO ESTÁ EM USO. O app atual roda em memória.
-- Os nomes de tabelas e colunas são os mesmos que o app usa (src/js),
-- então ligar o banco é só trocar o MemoryAdapter pelo HttpAdapter.
-- Cada linha pertence a um usuário (user_id) e só ele enxerga (RLS).
-- =====================================================================

create extension if not exists "pgcrypto";

-- helper: colunas comuns
-- id uuid · user_id (dono) · created_at · updated_at

create table if not exists tempo_agencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  abbr text,
  cnpj text, contact text, address text, notes text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agency_id uuid references tempo_agencies(id) on delete set null,   -- nulo = cliente direto
  name text not null,
  cnpj text, contact text, address text, notes text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_status_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('work','payment','quote','reimb_pay','reimb_refund','reimb_req','wa_tipo')),
  name text not null,
  color text,
  category text not null,          -- work: todo/active/done/cancelled · payment: open/closed · quote: open/won/lost
  "order" int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_work_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, color text, "order" int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references tempo_clients(id) on delete restrict,
  work_type_id uuid,                                                -- tipo de trabalho; tarefas novas herdam
  quote_id uuid,
  name text not null,
  description text, notes text,
  status_id uuid references tempo_status_options(id),
  payment_status_id uuid references tempo_status_options(id),
  deadline date, deadline_original date,
  project_type text,                                                 -- Vídeo 2D / Vídeo 3D / Design / Outro
  budget numeric(14,2), remaining_override numeric(14,2),
  estimated_hours numeric(8,2), revisions_included int,
  approved_at timestamptz, started_at timestamptz, sent_at timestamptz, client_approved_at timestamptz,
  completed_at timestamptz, invoice_at timestamptz, paid_at timestamptz,
  imported_from text,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references tempo_projects(id) on delete cascade,
  parent_id uuid references tempo_tasks(id) on delete cascade,      -- preenchido = subtarefa
  deadline_time text,
  est_min integer,                                                  -- tempo previsto da tarefa, em minutos                                               -- hora do prazo (HH:MM), opcional
  depends_on jsonb not null default '[]'::jsonb,                    -- ids das tarefas que precisam terminar antes
  owner text,                                                        -- responsável: null/'Eu' = eu (com apontamento); outro nome = terceiro (sem apontamento)
  pos jsonb,                                                         -- posição do nó no editor de fluxo {x,y}
  name text not null,
  status_id uuid references tempo_status_options(id),
  status_inherited boolean not null default true,                    -- false = exceção manual
  work_type_id uuid references tempo_work_types(id),
  deadline date, notes text, "order" int default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references tempo_projects(id) on delete cascade,
  number int not null, requested_at timestamptz, requested_by text,
  description text, resent_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agency_id uuid references tempo_agencies(id) on delete set null,
  client_id uuid references tempo_clients(id) on delete set null,
  project_id uuid references tempo_projects(id) on delete cascade,
  task_id uuid references tempo_tasks(id) on delete set null,
  work_type_id uuid references tempo_work_types(id),
  revision_id uuid references tempo_revisions(id) on delete set null,
  state text not null check (state in ('running','paused','done')),
  segments jsonb not null default '[]',          -- [{ "s": inicio, "e": fim|null }] — tempo = soma dos intervalos
  notes text,
  edits jsonb not null default '[]',             -- histórico de correções (antes + motivo)
  idle_suggestions jsonb not null default '[]',  -- pausas sugeridas aguardando decisão
  manual boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- no máximo uma sessão ativa/pausada por usuário
create unique index if not exists one_active_entry on tempo_time_entries(user_id) where state in ('running','paused');

create table if not exists tempo_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references tempo_projects(id) on delete cascade,
  amount numeric(14,2) not null, date date, note text, invoice text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_deadline_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references tempo_projects(id) on delete cascade,
  task_id uuid references tempo_tasks(id) on delete cascade,
  "from" date, "to" date, reason text, at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agency_id uuid references tempo_agencies(id) on delete set null,
  client_id uuid references tempo_clients(id) on delete set null,
  project_id uuid references tempo_projects(id) on delete set null,   -- preenchido após conversão
  name text not null, status_id uuid references tempo_status_options(id),
  work_type_id uuid references tempo_work_types(id),
  value numeric(14,2), est_hours numeric(8,2),
  sent_at date, valid_until date,
  revisions_included int, extra_revision_price numeric(14,2),
  followups jsonb not null default '[]', calc jsonb, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists tempo_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity text not null, entity_id uuid, project_id uuid references tempo_projects(id) on delete cascade,
  type text not null, description text, "from" text, "to" text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz
);

-- lembretes e preferências: estrutura livre (jsonb)
create table if not exists tempo_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table if not exists tempo_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, value jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (user_id, key)
);

create table if not exists tempo_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,               -- pause | prazo | cobranca | orcamento | reminder | todo
  key text,                         -- evita duplicar o mesmo aviso
  title text not null, body text,
  entity text, entity_id uuid, project_id uuid references tempo_projects(id) on delete cascade,
  status text not null default 'pending',  -- pending | accepted | ignored | snoozed | done | open
  decision text, decided_at timestamptz, snooze_until date,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists tempo_notices_status on tempo_notices (user_id, status, created_at desc);

create table if not exists tempo_reimb_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null,                  -- YYYY-MM (uma tabela por mês)
  name text, note text, date date, amount numeric(14,2), suggested_amount numeric(14,2), paid_on date, req_on date, refunded_on date,
  files jsonb not null default '[]'::jsonb,   -- [{ "tipo": "nota" | "comprovante", "path": "/Users/…" }] (coluna Arquivos)
  pay_id uuid references tempo_status_options(id) on delete set null,
  refund_id uuid references tempo_status_options(id) on delete set null,
  req_id uuid references tempo_status_options(id) on delete set null,
  "order" int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- migração: alter table tempo_reimb_rows add column if not exists suggested_amount numeric(14,2), add column if not exists req_on date;
-- migração V2.05.02: alter table tempo_reimb_rows add column if not exists files jsonb not null default '[]'::jsonb;
--   (os [LINK NF]/[LINK PAGAMENTO] que estavam na anotação foram para files)
create index if not exists tempo_reimb_rows_month on tempo_reimb_rows (user_id, month, "order");

create table if not exists tempo_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references tempo_projects(id) on delete set null,  -- custo de terceiro ligado ao orçamento do projeto
  task_id uuid references tempo_tasks(id) on delete set null,
  month text not null,
  kind text not null,
  name text, cat text, note text,
  amount numeric(14,2),
  due_date date,
  paid_on date,
  status text,
  inst_no int,
  inst_total int,
  "order" int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists tempo_expenses_month on tempo_expenses (user_id, month, "order");

-- Segurança: cada usuário só lê e escreve as próprias linhas
do $$
declare t text;
begin
  foreach t in array array['tempo_agencies','tempo_clients','tempo_status_options','tempo_work_types','tempo_projects','tempo_tasks',
    'tempo_revisions','tempo_time_entries','tempo_payments','tempo_deadline_changes','tempo_quotes','tempo_status_history','tempo_reminders','tempo_settings','tempo_notices','tempo_reimb_rows','tempo_expenses']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create index if not exists %I on %I(user_id)', t || '_user_idx', t);
  end loop;
end $$;

-- Extratos bancários (Gmail → Nubank). Só o servidor escreve em tempo_integrations;
-- tempo_bank_txns é lida pelo dono (RLS) e atualizada só na revisão.
create table if not exists tempo_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  account_email text,
  refresh_token text,
  oauth_state text,
  last_sync_at timestamptz, last_message_date timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (user_id, provider)
);
create table if not exists tempo_bank_txns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fitid text not null, source text not null default 'nubank', account_tail text,
  posted_on date not null, amount numeric not null, memo text, counterpart text, counterpart_doc text,
  flow text not null check (flow in ('in','out')), scope text not null check (scope in ('externa','interna','cartao')), category text,
  review_status text not null default 'novo' check (review_status in ('novo','revisado','ignorado')),
  expense_id uuid, payment_id uuid references tempo_payments(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz,
  unique (user_id, fitid)
);
-- Uma entrada bancária cobre vários pagamentos (ex.: um PIX de três projetos). amount = parcela desta entrada em cada pagamento.
create table if not exists tempo_bank_payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  txn_id uuid not null references tempo_bank_txns(id) on delete cascade,
  payment_id uuid not null references tempo_payments(id) on delete cascade,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (txn_id, payment_id)
);
alter table tempo_bank_payment_links enable row level security;
drop policy if exists own_rows on tempo_bank_payment_links;
create policy own_rows on tempo_bank_payment_links for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Um horário, uma sessão (25/10/2026): os intervalos de cada sessão viram "posses" e o banco recusa posses sobrepostas.
create extension if not exists btree_gist;
create table if not exists tempo_time_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references tempo_time_entries(id) on delete cascade,
  period tstzrange not null,
  constraint tempo_time_claims_sem_sobreposicao exclude using gist (user_id with =, period with &&)
);
create index if not exists tempo_time_claims_entry on tempo_time_claims(entry_id);
alter table tempo_time_claims enable row level security;
drop policy if exists own_rows on tempo_time_claims;
create policy own_rows on tempo_time_claims for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function tempo_claims_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from tempo_time_claims where entry_id = new.id;
  insert into tempo_time_claims (user_id, entry_id, period)
  select new.user_id, new.id, r from (
    select unnest(range_agg(tstzrange((x->>'s')::timestamptz, nullif(x->>'e', '')::timestamptz, '[)'))) r
    from jsonb_array_elements(coalesce(new.segments, '[]'::jsonb)) x
    where x->>'s' is not null and (nullif(x->>'e', '') is null or (x->>'e')::timestamptz > (x->>'s')::timestamptz)
  ) z;
  return new;
exception when exclusion_violation then
  raise exception 'tempo_sobreposto: esse horário já está em outra sessão' using errcode = '23P01';
end $$;
drop trigger if exists tempo_claims_sync on tempo_time_entries;
create trigger tempo_claims_sync after insert or update of segments on tempo_time_entries
  for each row execute function tempo_claims_sync();

-- V2.03.02: valor sugerido (copiado do mês anterior) até ser confirmado; não entra nas somas
alter table public.tempo_expenses add column if not exists amount_sug numeric(12,2);

-- Agenda do Rafa: com quem ele fica em cada dia.
create table if not exists tempo_rafa_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null, who text, note text, horario text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

-- =====================================================================
-- SINCRONIZAÇÃO (16/11/2026)
-- updated_at é carimbado pelo banco em toda alteração; tempo_sync_state()
-- devolve, por tabela, "quantidade|última alteração" das linhas da conta.
-- O app chama essa função a cada minuto e baixa só as tabelas que mudaram.
-- =====================================================================
create or replace function public.tempo_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
revoke execute on function public.tempo_touch() from public, anon, authenticated;
revoke execute on function public.tempo_claims_sync() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['tempo_agencies','tempo_clients','tempo_projects','tempo_tasks','tempo_time_entries','tempo_revisions','tempo_quotes','tempo_payments','tempo_deadline_changes','tempo_work_types','tempo_status_options','tempo_reminders','tempo_status_history','tempo_settings','tempo_notices','tempo_reimb_rows','tempo_expenses','tempo_rafa_days'] loop
    execute format('drop trigger if exists tempo_touch on public.%I', t);
    execute format('create trigger tempo_touch before update on public.%I for each row execute function public.tempo_touch()', t);
  end loop;
end $$;

create or replace function public.tempo_sync_state() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t text; res jsonb := '{}'::jsonb; n bigint; m timestamptz;
begin
  foreach t in array array['tempo_agencies','tempo_clients','tempo_projects','tempo_tasks','tempo_time_entries','tempo_revisions','tempo_quotes','tempo_payments','tempo_deadline_changes','tempo_work_types','tempo_status_options','tempo_reminders','tempo_status_history','tempo_settings','tempo_notices','tempo_reimb_rows','tempo_expenses','tempo_rafa_days','tempo_wa_contacts','tempo_wa_daily'] loop
    execute format('select count(*), max(greatest(created_at, coalesce(updated_at, created_at))) from public.%I', t) into n, m;
    res := res || jsonb_build_object(t, n::text || '|' || coalesce(extract(epoch from m)::text, ''));
  end loop;
  return res;
end $$;
revoke execute on function public.tempo_sync_state() from public, anon;
grant execute on function public.tempo_sync_state() to authenticated;

-- Contatos do WhatsApp (o app do Mac manda nome, tipo e quantidade; nunca o texto das mensagens).
-- tipo_id marca quem é de trabalho: o tempo de WhatsApp com esses contatos conta como trabalho, e não como pausa.
create table if not exists tempo_wa_contacts (
  id uuid not null unique default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jid text not null,
  name text,
  tipo text,                            -- 'amigo' ou 'grupo', como veio do WhatsApp
  tipo_id uuid references tempo_status_options(id) on delete set null,   -- Cliente, Agência, Colega, Fornecedor, Administrativo, Misto, Amigo
  client_id uuid references tempo_clients(id) on delete set null,
  agency_id uuid references tempo_agencies(id) on delete set null,
  project_id uuid references tempo_projects(id) on delete set null,   -- grupo ligado a um projeto
  last_at timestamptz,                  -- última mensagem na conversa (ordem do WhatsApp)
  last_in timestamptz, last_out timestamptz,   -- última recebida e última enviada (para "Responder [contato]")
  resp_med_s int, resp_n int,           -- tempo médio de resposta (segundos) e em quantas respostas, últimos 30 dias
  msgs_7d int, fora_30d int,             -- mensagens nos últimos 7 dias e fora do horário (fim de semana, antes das 9h, depois das 19h) nos últimos 30
  created_at timestamptz not null default now(), updated_at timestamptz,
  primary key (user_id, jid)
);
-- migração: alter table tempo_wa_contacts add column if not exists id uuid not null default gen_random_uuid(), add column if not exists tipo_id uuid, add column if not exists updated_at timestamptz;
-- migração: create unique index if not exists tempo_wa_contacts_id_key on tempo_wa_contacts(id);
-- migração: alter table tempo_wa_contacts add column if not exists last_at timestamptz;

-- Mensagens enviadas por conversa e por dia (só a contagem).
create table if not exists tempo_wa_daily (
  id uuid not null unique default gen_random_uuid(),   -- o site lê toda tabela ordenando por created_at e id
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jid text not null,
  day date not null,
  sent int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz,
  primary key (user_id, jid, day)
);
-- migração: alter table tempo_wa_daily add column if not exists id uuid not null default gen_random_uuid(), add column if not exists created_at timestamptz not null default now(), add column if not exists updated_at timestamptz;

-- WhatsApp entra na sincronização leve (carimbo de updated_at em toda alteração).
drop trigger if exists tempo_touch on public.tempo_wa_contacts;
create trigger tempo_touch before update on public.tempo_wa_contacts for each row execute function public.tempo_touch();
drop trigger if exists tempo_touch on public.tempo_wa_daily;
create trigger tempo_touch before update on public.tempo_wa_daily for each row execute function public.tempo_touch();
-- migração (16/11): tipo de contato do WhatsApp em tempo_status_options
-- alter table tempo_status_options drop constraint tempo_status_options_kind_check;
-- alter table tempo_status_options add constraint tempo_status_options_kind_check check (kind = any (array['work','payment','quote','reimb_pay','reimb_refund','reimb_req','wa_tipo']));
-- migração: alter table tempo_wa_contacts add column if not exists project_id uuid references tempo_projects(id) on delete set null, add column if not exists last_in timestamptz, add column if not exists last_out timestamptz, add column if not exists resp_med_s int, add column if not exists resp_n int;

-- migração (V2.06.05): alter table tempo_wa_contacts add column if not exists msgs_7d int, add column if not exists fora_30d int;

-- 21/11/2026: dia marcado pelo app (automático) × à mão
alter table tempo_rafa_days add column if not exists auto boolean not null default false;
-- V2.06.56: notas fiscais emitidas (lidas da pasta do iCloud pelo app do Mac)
create table if not exists tempo_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  serie text not null default 'nacional',      -- 'nacional' (NFS-e padrão nacional) ou 'municipal' (antiga, até 2025)
  numero int,
  chave text,                                   -- chave de acesso (50 dígitos) da NFS-e nacional
  emitida_em date, competencia date,
  valor numeric(14,2),
  tomador_nome text, tomador_doc text, descricao text,
  situacao text,                                -- como veio no arquivo: 'gerada' | 'cancelada' | 'substituida'
  substitui text[] not null default '{}',       -- chaves de outras notas citadas nesta (substituição)
  status_manual text,                           -- 'valida' | 'cancelada' | 'substituida' (o que você marcou vence o automático)
  substituida_por int,                          -- número da nota que substituiu esta
  enviada_em date,
  agency_id uuid references tempo_agencies(id) on delete set null,
  client_id uuid references tempo_clients(id) on delete set null,
  payment_id uuid references tempo_payments(id) on delete set null,
  vinculo_manual boolean not null default false, -- agência/cliente/pagamento escolhidos à mão: o automático não mexe
  arquivo text, sha text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create unique index if not exists tempo_invoices_num on tempo_invoices (user_id, serie, numero);
alter table tempo_invoices enable row level security;
drop policy if exists own_rows on tempo_invoices;
create policy own_rows on tempo_invoices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists tempo_invoices_user_idx on tempo_invoices(user_id);
drop trigger if exists tempo_touch on public.tempo_invoices;
create trigger tempo_touch before update on public.tempo_invoices for each row execute function public.tempo_touch();

create or replace function public.tempo_sync_state() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t text; res jsonb := '{}'::jsonb; n bigint; m timestamptz;
begin
  foreach t in array array['tempo_agencies','tempo_clients','tempo_projects','tempo_tasks','tempo_time_entries','tempo_revisions','tempo_quotes','tempo_payments','tempo_deadline_changes','tempo_work_types','tempo_status_options','tempo_reminders','tempo_status_history','tempo_settings','tempo_notices','tempo_reimb_rows','tempo_expenses','tempo_rafa_days','tempo_wa_contacts','tempo_wa_daily','tempo_invoices'] loop
    execute format('select count(*), max(greatest(created_at, coalesce(updated_at, created_at))) from public.%I', t) into n, m;
    res := res || jsonb_build_object(t, n::text || '|' || coalesce(extract(epoch from m)::text, ''));
  end loop;
  return res;
end $$;
revoke execute on function public.tempo_sync_state() from public, anon;
grant execute on function public.tempo_sync_state() to authenticated;
