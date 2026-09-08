-- Fixes surfaced by the first import, plus the contacts.source column.
--
-- 1. HTML entities (&amp; etc.) are decoded on every write to contacts, companies, touches.
-- 2. date_accepted is no longer defaulted at insert. It is only inferred when a contact is
--    observed moving out of 'requested' into a status that implies the invite was accepted.
-- 3. A contact inserted (or moved) into soft_no with no recontact_after gets one automatically.
-- 4. contacts.source: where the person came from.
-- Existing rows are repaired at the end.

-- ---------------------------------------------------------------------------
-- html_decode
-- ---------------------------------------------------------------------------
create or replace function html_decode(p text) returns text
language sql immutable as $$
  select case when p is null then null else
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      p,
      '&nbsp;',  ' '),
      '&#39;',   ''''),
      '&#x27;',  ''''),
      '&apos;',  ''''),
      '&quot;',  '"'),
      '&#8217;', '’'),
      '&#8216;', '‘'),
      '&#8211;', '–'),
      '&#8212;', '—'),
      '&lt;',    '<'),
      '&gt;',    '>'),
      '&amp;',   '&')
  end
$$;

-- ---------------------------------------------------------------------------
-- contacts.source
-- ---------------------------------------------------------------------------
alter table contacts add column source text
  check (source in ('cold_email','linkedin','referral','cc_surfaced','inbound'));
create index contacts_source_idx on contacts (source);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------
create or replace function companies_normalize() returns trigger
language plpgsql as $$
begin
  new.domain   := normalize_domain(new.domain);
  new.name     := html_decode(trim(new.name));
  new.industry := nullif(html_decode(trim(new.industry)), '');
  new.location := nullif(html_decode(trim(new.location)), '');
  new.notes    := html_decode(new.notes);
  return new;
end $$;

create or replace function contacts_normalize() returns trigger
language plpgsql as $$
begin
  new.linkedin_url := normalize_linkedin_url(new.linkedin_url);
  new.email        := nullif(lower(trim(new.email)), '');
  new.first_name   := html_decode(trim(new.first_name));
  new.last_name    := nullif(html_decode(trim(new.last_name)), '');
  new.title        := nullif(html_decode(trim(new.title)), '');
  new.notes        := html_decode(new.notes);
  new.updated_at   := now();

  -- 'requested' means the invite went out; default that date to today.
  if new.status = 'requested' and new.date_requested is null then
    new.date_requested := current_date;
  end if;

  -- Only infer date_accepted when we actually see the transition out of 'requested'.
  -- Never at insert: cold-email and referral contacts were never a LinkedIn connection.
  if tg_op = 'UPDATE' and old.status = 'requested'
     and new.status in ('accepted','messaged','replied','live','signed')
     and new.date_accepted is null then
    new.date_accepted := current_date;
  end if;

  -- soft_no always carries a recontact date: reply date (last touch) + 6 months, else today + 6 months.
  if new.status = 'soft_no' and new.recontact_after is null then
    new.recontact_after := (coalesce(new.last_touch_at::date, current_date) + interval '6 months')::date;
  end if;

  return new;
end $$;

create or replace function touches_normalize() returns trigger
language plpgsql as $$
begin
  new.subject := html_decode(new.subject);
  new.hook    := html_decode(new.hook);
  new.body    := html_decode(new.body);
  return new;
end $$;

drop trigger if exists touches_normalize_trg on touches;
create trigger touches_normalize_trg
  before insert or update on touches
  for each row execute function touches_normalize();

-- ---------------------------------------------------------------------------
-- views: recreate so they pick up the new column
-- ---------------------------------------------------------------------------
drop view if exists followups_due;
drop view if exists recontactable;

create view followups_due as
  select c.*, co.name as company_name, co.domain as company_domain
  from contacts c
  left join companies co on co.id = c.company_id
  where c.status = 'messaged'
    and c.last_touch_at < now() - interval '7 days'
    and c.touch_count < 2
  order by c.last_touch_at;

create view recontactable as
  select c.*, co.name as company_name, co.domain as company_domain
  from contacts c
  left join companies co on co.id = c.company_id
  where c.status = 'soft_no'
    and c.recontact_after <= current_date
  order by c.recontact_after;

-- ---------------------------------------------------------------------------
-- repair existing rows
-- ---------------------------------------------------------------------------

-- date_accepted that equals the row's own creation day was the old insert-time default, not data.
update contacts
   set date_accepted = null
 where date_accepted is not null
   and (date_accepted = created_at::date
        or date_accepted = (created_at at time zone 'utc')::date);

-- soft_no rows without a recontact date (the trigger fills it in on this touch-less update).
update contacts
   set recontact_after = (coalesce(last_touch_at::date, current_date) + interval '6 months')::date
 where status = 'soft_no' and recontact_after is null;

-- re-run the normalise triggers on anything that contains an entity.
update contacts  set first_name = first_name where concat_ws(' ', first_name, last_name, title, notes) ~ '&(#\d+|#x[0-9a-f]+|[a-z]+);';
update companies set name = name             where concat_ws(' ', name, industry, location, notes)   ~ '&(#\d+|#x[0-9a-f]+|[a-z]+);';
update touches   set subject = subject       where concat_ws(' ', subject, hook, body)               ~ '&(#\d+|#x[0-9a-f]+|[a-z]+);';
