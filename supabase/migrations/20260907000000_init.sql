-- Outreach Tracker: initial schema
-- Three tables (companies, contacts, touches) plus the SQL functions that both
-- the MCP server and the web app call, so the business rules live in one place.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,                -- dedupe key, normalised to bare host (securemedical.com)
  industry    text,
  location    text,
  notes       text,
  created_at  timestamptz not null default now()
);

create unique index companies_domain_uidx on companies (domain) where domain is not null;
create index companies_name_trgm_idx on companies using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table contacts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references companies(id) on delete set null,
  first_name       text not null,
  last_name        text,
  linkedin_url     text,             -- the real dedupe key for people
  email            text,
  email_verified   boolean not null default false,
  phone            text,
  title            text,
  type             text check (type in ('client','hiring','network','recruiter')),
  status           text not null default 'requested'
                   check (status in ('requested','accepted','messaged','replied','live',
                                     'soft_no','hard_decline','signed','closed','skipped')),
  date_requested   date,
  date_accepted    date,
  last_touch_at    timestamptz,      -- denormalised from touches
  touch_count      int not null default 0,
  best_fit         boolean not null default false,
  asu_tie          boolean not null default false,
  recontact_after  date,             -- soft_no only: reply date + 6 months
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index contacts_linkedin_url_uidx on contacts (linkedin_url) where linkedin_url is not null;
create index contacts_email_idx on contacts (email);
create index contacts_status_idx on contacts (status);
create index contacts_recontact_after_idx on contacts (recontact_after);
create index contacts_company_id_idx on contacts (company_id);
create index contacts_name_trgm_idx on contacts using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- touches: one row per message, insert-only
-- ---------------------------------------------------------------------------
create table touches (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  direction   text not null check (direction in ('outbound','inbound')),
  channel     text not null check (channel in ('email','linkedin','call','meeting')),
  sent_at     timestamptz not null default now(),
  subject     text,
  hook        text,
  body        text,
  created_at  timestamptz not null default now()
);

create index touches_contact_id_idx on touches (contact_id);
create index touches_sent_at_idx on touches (sent_at);

-- ---------------------------------------------------------------------------
-- normalisation helpers
-- ---------------------------------------------------------------------------
create or replace function normalize_domain(p text) returns text
language sql immutable as $$
  select nullif(
    regexp_replace(                                        -- strip www.
      regexp_replace(                                      -- strip path / query / fragment
        regexp_replace(lower(trim(p)), '^[a-z]+://', ''),  -- strip scheme
        '[/?#].*$', ''),
      '^www\.', ''),
    '')
$$;

create or replace function normalize_linkedin_url(p text) returns text
language sql immutable as $$
  select case
    when p is null or trim(p) = '' then null
    else 'https://www.linkedin.com/' ||
         regexp_replace(                                                  -- strip trailing slashes
           regexp_replace(                                                -- strip query / fragment
             regexp_replace(                                              -- strip host
               regexp_replace(lower(trim(p)), '^[a-z]+://', ''),          -- strip scheme
               '^(www\.)?linkedin\.com/', ''),
             '[?#].*$', ''),
           '/+$', '')
  end
$$;

create or replace function companies_normalize() returns trigger
language plpgsql as $$
begin
  new.domain := normalize_domain(new.domain);
  new.name := trim(new.name);
  return new;
end $$;

create trigger companies_normalize_trg
  before insert or update on companies
  for each row execute function companies_normalize();

create or replace function contacts_normalize() returns trigger
language plpgsql as $$
begin
  new.linkedin_url := normalize_linkedin_url(new.linkedin_url);
  new.email := nullif(lower(trim(new.email)), '');
  new.first_name := trim(new.first_name);
  new.last_name := nullif(trim(new.last_name), '');
  new.updated_at := now();
  -- sensible defaults for the dates that drive the pipeline
  if new.status = 'requested' and new.date_requested is null then
    new.date_requested := current_date;
  end if;
  -- these statuses imply the invite was accepted at some point
  if new.date_accepted is null
     and new.status in ('accepted','messaged','replied','live','signed')
     and (tg_op = 'INSERT' or old.status = 'requested') then
    new.date_accepted := current_date;
  end if;
  return new;
end $$;

create trigger contacts_normalize_trg
  before insert or update on contacts
  for each row execute function contacts_normalize();

-- ---------------------------------------------------------------------------
-- read helpers
-- ---------------------------------------------------------------------------

-- Full picture of one contact: contact + company + every touch, oldest first.
create or replace function contact_detail(p_contact_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'contact', to_jsonb(c),
    'company', to_jsonb(co),
    'touches', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sent_at)
      from touches t where t.contact_id = c.id), '[]'::jsonb)
  )
  from contacts c
  left join companies co on co.id = c.company_id
  where c.id = p_contact_id
$$;

-- Fuzzy search across name, email, linkedin_url, company name and domain.
-- Returns an array of contact_detail objects, best match first.
create or replace function search_contacts(q text, max_results int default 10) returns jsonb
language sql stable as $$
  with needle as (
    select lower(trim(q)) as s,
           normalize_domain(q) as d,
           normalize_linkedin_url(q) as l
  ),
  scored as (
    select c.id,
      greatest(
        similarity(lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), n.s),
        case when c.email ilike '%' || n.s || '%' then 1.0 else 0 end,
        case when c.linkedin_url = n.l then 1.0
             when c.linkedin_url ilike '%' || n.s || '%' then 0.9 else 0 end,
        case when co.domain = n.d then 0.95 else 0 end,
        similarity(lower(coalesce(co.name,'')), n.s),
        case when (coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) ilike '%' || n.s || '%' then 0.8 else 0 end,
        case when coalesce(co.name,'') ilike '%' || n.s || '%' then 0.7 else 0 end
      ) as score
    from contacts c
    left join companies co on co.id = c.company_id
    cross join needle n
  )
  select coalesce(jsonb_agg(contact_detail(s.id) order by s.score desc), '[]'::jsonb)
  from (select id, score from scored where score >= 0.3 order by score desc limit max_results) s
$$;

-- Company by name or domain, plus every contact under it (with touch counts).
create or replace function company_detail(q text) returns jsonb
language sql stable as $$
  with needle as (select lower(trim(q)) as s, normalize_domain(q) as d),
  hit as (
    select co.*
    from companies co cross join needle n
    where co.domain = n.d
       or co.name ilike '%' || n.s || '%'
       or similarity(lower(co.name), n.s) >= 0.3
    order by
      case when co.domain = n.d then 0
           when lower(co.name) = n.s then 1
           when co.name ilike '%' || n.s || '%' then 2
           else 3 end,
      similarity(lower(co.name), n.s) desc
    limit 1
  )
  select case when (select count(*) from hit) = 0 then null else
    jsonb_build_object(
      'company', (select to_jsonb(h) from hit h),
      'contacts', coalesce((
        select jsonb_agg(to_jsonb(c) order by c.created_at)
        from contacts c where c.company_id = (select id from hit)), '[]'::jsonb)
    ) end
$$;

-- ---------------------------------------------------------------------------
-- write helpers
-- ---------------------------------------------------------------------------

-- Insert a touch and keep the denormalised columns on contacts in sync.
create or replace function log_touch(
  p_contact_id uuid,
  p_direction  text,
  p_channel    text,
  p_sent_at    timestamptz default now(),
  p_subject    text default null,
  p_hook       text default null,
  p_body       text default null
) returns touches
language plpgsql as $$
declare
  t touches;
begin
  insert into touches (contact_id, direction, channel, sent_at, subject, hook, body)
  values (p_contact_id, p_direction, p_channel, coalesce(p_sent_at, now()), p_subject, p_hook, p_body)
  returning * into t;

  update contacts
     set last_touch_at = greatest(coalesce(last_touch_at, t.sent_at), t.sent_at),
         touch_count   = touch_count + 1
   where id = p_contact_id;

  return t;
end $$;

-- Change status. soft_no auto-sets recontact_after = today + 6 months.
-- An optional note is appended to contacts.notes with a date stamp.
create or replace function set_contact_status(
  p_contact_id uuid,
  p_status     text,
  p_note       text default null
) returns contacts
language plpgsql as $$
declare
  c contacts;
begin
  update contacts
     set status = p_status,
         recontact_after = case
           when p_status = 'soft_no' then current_date + interval '6 months'
           else recontact_after end,
         notes = case
           when p_note is null or trim(p_note) = '' then notes
           else concat_ws(E'\n', nullif(notes, ''), to_char(current_date, 'YYYY-MM-DD') || ': ' || trim(p_note))
         end
   where id = p_contact_id
  returning * into c;

  if not found then
    raise exception 'contact % not found', p_contact_id;
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- pipeline views
-- ---------------------------------------------------------------------------
create or replace view followups_due as
  select c.*, co.name as company_name, co.domain as company_domain
  from contacts c
  left join companies co on co.id = c.company_id
  where c.status = 'messaged'
    and c.last_touch_at < now() - interval '7 days'
    and c.touch_count < 2
  order by c.last_touch_at;

create or replace view recontactable as
  select c.*, co.name as company_name, co.domain as company_domain
  from contacts c
  left join companies co on co.id = c.company_id
  where c.status = 'soft_no'
    and c.recontact_after <= current_date
  order by c.recontact_after;

-- ---------------------------------------------------------------------------
-- security: lock the tables down. Only the service role (used by the MCP
-- server and the web app's server side) can read or write.
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table contacts  enable row level security;
alter table touches   enable row level security;
