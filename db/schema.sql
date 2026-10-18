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
  kind text not null check (kind in ('work','payment','quote','reimb_pay','reimb_refund','reimb_req')),
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
  quote_id uuid,
  name text not null,
  description text, notes text,
  status_id uuid references tempo_status_options(id),
  payment_status_id uuid references tempo_status_options(id),
  deadline date, deadline_original date,
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
  name text, note text, date date, amount numeric(14,2),
  pay_id uuid references tempo_status_options(id) on delete set null,
  refund_id uuid references tempo_status_options(id) on delete set null,
  req_id uuid references tempo_status_options(id) on delete set null,
  "order" int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists tempo_reimb_rows_month on tempo_reimb_rows (user_id, month, "order");

create table if not exists tempo_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
  expense_id uuid, created_at timestamptz not null default now(), updated_at timestamptz,
  unique (user_id, fitid)
);
