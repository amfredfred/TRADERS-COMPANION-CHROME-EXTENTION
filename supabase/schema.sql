-- Trader's Companion — Supabase Schema
-- Run in the Supabase SQL editor to set up the database.

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid references auth.users on delete cascade primary key,
  created_at timestamptz default now() not null,
  email      text
);

alter table profiles enable row level security;
create policy "Users can read own profile"   on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Account profiles ─────────────────────────────────────────────────────────
create table if not exists accounts (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references profiles(id) on delete cascade not null,
  name             text                        not null,
  account_type     text                        not null check (account_type in ('live', 'prop_firm', 'demo', 'backtest')),
  platform         text,
  starting_balance numeric(18, 2)              default 0,
  created_at       timestamptz                 default now() not null
);

alter table accounts enable row level security;
create policy "Users own their accounts" on accounts
  using (auth.uid() = user_id);

-- ── Playbooks ─────────────────────────────────────────────────────────────────
create table if not exists playbooks (
  id                          uuid default gen_random_uuid() primary key,
  account_id                  uuid references accounts(id) on delete cascade not null,
  user_id                     uuid references profiles(id) on delete cascade not null,
  name                        text           not null,
  allowed_sessions            text[]         default '{}',
  htf_bias_required           boolean        default false,
  allowed_symbols             text[]         default '{}',
  entry_confirmation          text           default '',
  checklist_items             jsonb          default '[]',   -- [{id, label, required}]
  stop_rule                   text           default '',
  max_trades_per_day          integer        default 3,
  cooldown_after_loss_minutes integer        default 30 check (cooldown_after_loss_minutes >= 30),
  active                      boolean        default true,
  created_at                  timestamptz    default now() not null,
  updated_at                  timestamptz    default now() not null
);

alter table playbooks enable row level security;
create policy "Users own their playbooks" on playbooks
  using (auth.uid() = user_id);

-- ── Trades ────────────────────────────────────────────────────────────────────
create table if not exists trades (
  id                    uuid default gen_random_uuid() primary key,
  trade_intent_id       uuid                     not null,
  account_id            uuid references accounts(id) on delete cascade not null,
  user_id               uuid references profiles(id) not null,

  state                 text                     not null,
  symbol                text,
  direction             text check (direction in ('long', 'short')),
  pnl                   numeric(18, 2),

  setup_grade           text check (setup_grade in ('A', 'B', 'C', 'Impulse')),
  rules_followed        boolean,
  entry_reason          text,
  exit_reflection       text,
  stop_loss_level       text,
  invalidation          text,
  intended_risk         numeric(18, 2),

  ai_entry_assessment   text,
  ai_exit_assessment    text,
  entry_screenshot_url  text,
  exit_screenshot_url   text,

  mistake_tags          text[]    default '{}',
  win_tags              text[]    default '{}',
  flagged_unplanned     boolean   default false,

  opened_at             timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null
);

alter table trades enable row level security;
create policy "Users own their trades" on trades
  using (auth.uid() = user_id);

create index trades_account_id_idx on trades (account_id);
create index trades_opened_at_idx  on trades (opened_at desc);

-- ── Platform locks ────────────────────────────────────────────────────────────
-- Persists across reinstalls and browser restarts (survival layer).
create table if not exists locks (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  account_id      uuid references accounts(id) on delete cascade,

  reason          text not null,   -- machine-readable: impulse, revenge_trade, daily_budget, max_trades, rule_broken
  reason_detail   text default '',

  locked_at       timestamptz default now() not null,
  locked_until    timestamptz not null,

  overridden_at   timestamptz,
  override_reason text
);

alter table locks enable row level security;
create policy "Users own their locks" on locks
  using (auth.uid() = user_id);

create index locks_user_active_idx on locks (user_id, locked_until)
  where overridden_at is null;

-- ── Session settings (synced from local storage) ──────────────────────────────
create table if not exists session_settings (
  id                        uuid default gen_random_uuid() primary key,
  user_id                   uuid references profiles(id) on delete cascade not null unique,
  account_id                uuid references accounts(id),

  risk_percent              numeric(5, 2)  default 1     check (risk_percent > 0),
  max_trades                integer        default 3     check (max_trades > 0),
  enforcement_mode          text           default 'training' check (enforcement_mode in ('training', 'strict', 'prop_firm')),
  cooldown_minutes          integer        default 15,
  daily_profit_target       numeric(18, 2),
  giveback_limit_percent    numeric(5, 2)  default 30,
  hard_lock_percent         numeric(5, 2)  default 50,
  auto_no_trade_mode        boolean        default false,
  ai_provider               text           default 'claude' check (ai_provider in ('claude', 'gpt4o')),

  updated_at                timestamptz    default now() not null
);

alter table session_settings enable row level security;
create policy "Users own their settings" on session_settings
  using (auth.uid() = user_id);

-- ── Overrides log ─────────────────────────────────────────────────────────────
create table if not exists overrides (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references profiles(id) on delete cascade not null,
  lock_id     uuid        references locks(id),
  occurred_at timestamptz default now() not null
);

alter table overrides enable row level security;
create policy "Users own their overrides" on overrides
  using (auth.uid() = user_id);

create index overrides_user_occurred_idx on overrides (user_id, occurred_at desc);

-- Monthly override count (used for escalating lock durations).
-- to_char on timestamptz is not immutable, so we compute month_year here rather
-- than as a generated column.
create or replace view monthly_override_counts as
  select
    user_id,
    to_char(occurred_at at time zone 'UTC', 'YYYY-MM') as month_year,
    count(*)::int as override_count
  from overrides
  group by user_id, to_char(occurred_at at time zone 'UTC', 'YYYY-MM');
