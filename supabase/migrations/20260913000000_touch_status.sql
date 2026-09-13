-- Touch-level send state. A touch is written as a draft, then marked sent with the real send
-- time. Only sent touches count toward contacts.last_touch_at / touch_count and follow-ups.

alter table touches alter column sent_at drop not null;
alter table touches alter column sent_at drop default;   -- drafts have no send time
alter table touches add column status text not null default 'drafted'
  check (status in ('drafted','sent'));
alter table touches add column created_by text not null default 'jeel';
alter table touches add constraint touches_sent_has_time check (status <> 'sent' or sent_at is not null);
create index touches_status_idx on touches (status);

-- Everything logged before this migration has gone out.
update touches set status = 'sent';

-- ---------------------------------------------------------------------------
-- normalise
-- ---------------------------------------------------------------------------
create or replace function touches_normalize() returns trigger
language plpgsql as $$
begin
  new.subject    := html_decode(new.subject);
  new.hook       := html_decode(new.hook);
  new.body       := html_decode(new.body);
  new.created_by := coalesce(nullif(lower(trim(new.created_by)), ''), 'jeel');
  -- inbound messages are never drafts: they arrived
  if new.direction = 'inbound' then
    new.status  := 'sent';
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- log_touch: new signature with status + created_by
-- ---------------------------------------------------------------------------
drop function if exists log_touch(uuid, text, text, timestamptz, text, text, text);

create or replace function log_touch(
  p_contact_id uuid,
  p_direction  text,
  p_channel    text,
  p_sent_at    timestamptz default null,
  p_subject    text default null,
  p_hook       text default null,
  p_body       text default null,
  p_status     text default 'drafted',
  p_created_by text default 'jeel'
) returns touches
language plpgsql as $$
declare
  t        touches;
  v_status text := case when p_direction = 'inbound' then 'sent' else coalesce(p_status, 'drafted') end;
begin
  insert into touches (contact_id, direction, channel, sent_at, subject, hook, body, status, created_by)
  values (
    p_contact_id, p_direction, p_channel,
    case when v_status = 'sent' then coalesce(p_sent_at, now()) else null end,
    p_subject, p_hook, p_body, v_status, p_created_by
  )
  returning * into t;

  if t.status = 'sent' then
    update contacts
       set last_touch_at = greatest(coalesce(last_touch_at, t.sent_at), t.sent_at),
           touch_count   = touch_count + 1
     where id = t.contact_id;
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- mark_sent: drafted -> sent with the real send time
-- ---------------------------------------------------------------------------
create or replace function mark_sent(p_touch_id uuid, p_sent_at timestamptz default now()) returns touches
language plpgsql as $$
declare
  t touches;
begin
  select * into t from touches where id = p_touch_id;
  if not found then
    raise exception 'touch % not found', p_touch_id;
  end if;

  if t.status = 'sent' then
    -- already sent: allow correcting the time, never double count
    update touches set sent_at = coalesce(p_sent_at, sent_at) where id = p_touch_id returning * into t;
    update contacts set last_touch_at = (select max(sent_at) from touches where contact_id = t.contact_id and status = 'sent')
     where id = t.contact_id;
    return t;
  end if;

  update touches set status = 'sent', sent_at = coalesce(p_sent_at, now())
   where id = p_touch_id returning * into t;

  update contacts
     set last_touch_at = greatest(coalesce(last_touch_at, t.sent_at), t.sent_at),
         touch_count   = touch_count + 1
   where id = t.contact_id;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- pending_sends: every drafted touch grouped by contact, oldest draft first
-- ---------------------------------------------------------------------------
create or replace function pending_sends() returns jsonb
language sql stable as $$
  with grp as (
    select t.contact_id, min(t.created_at) as oldest,
           jsonb_agg(jsonb_build_object(
             'touch_id',   t.id,
             'channel',    t.channel,
             'subject',    t.subject,
             'hook',       t.hook,
             'body',       t.body,
             'created_by', t.created_by,
             'drafted_at', t.created_at
           ) order by t.created_at) as touches
    from touches t
    where t.status = 'drafted'
    group by t.contact_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'contact', jsonb_build_object(
        'id', c.id,
        'name', concat_ws(' ', c.first_name, c.last_name),
        'title', c.title,
        'company', co.name,
        'status', c.status,
        'email', c.email,
        'email_verified', c.email_verified,
        'linkedin_url', c.linkedin_url),
      'touches', g.touches
    ) order by g.oldest), '[]'::jsonb)
  from grp g
  join contacts c on c.id = g.contact_id
  left join companies co on co.id = c.company_id
$$;

-- ---------------------------------------------------------------------------
-- readers: drafts have no sent_at; follow-ups only count sent touches
-- ---------------------------------------------------------------------------
create or replace function contact_detail(p_contact_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'contact', to_jsonb(c),
    'company', to_jsonb(co),
    'touches', coalesce((
      select jsonb_agg(to_jsonb(t) order by coalesce(t.sent_at, t.created_at))
      from touches t where t.contact_id = c.id), '[]'::jsonb)
  )
  from contacts c
  left join companies co on co.id = c.company_id
  where c.id = p_contact_id
$$;

create or replace view followups_due as
  select c.*, co.name as company_name, co.domain as company_domain
  from contacts c
  left join companies co on co.id = c.company_id
  where c.status = 'messaged'
    and c.last_touch_at < now() - interval '7 days'
    and (
      select count(distinct date(t.sent_at))
      from touches t
      where t.contact_id = c.id
        and t.direction = 'outbound'
        and t.status = 'sent'
    ) < 2
  order by c.last_touch_at;
