-- Undo paths for touches: delete one, or revert a sent touch back to drafted.
-- Both recompute the denormalised columns on contacts from the remaining sent touches.

create or replace function recount_contact_touches(p_contact_id uuid) returns void
language sql as $$
  update contacts
     set touch_count   = (select count(*)     from touches where contact_id = p_contact_id and status = 'sent'),
         last_touch_at = (select max(sent_at) from touches where contact_id = p_contact_id and status = 'sent')
   where id = p_contact_id
$$;

create or replace function delete_touch(p_touch_id uuid) returns touches
language plpgsql as $$
declare
  t touches;
begin
  delete from touches where id = p_touch_id returning * into t;
  if not found then
    raise exception 'touch % not found', p_touch_id;
  end if;
  perform recount_contact_touches(t.contact_id);
  return t;
end $$;

create or replace function unmark_sent(p_touch_id uuid) returns touches
language plpgsql as $$
declare
  t touches;
begin
  select * into t from touches where id = p_touch_id;
  if not found then
    raise exception 'touch % not found', p_touch_id;
  end if;
  if t.direction = 'inbound' then
    raise exception 'inbound touches cannot be drafts; delete it instead';
  end if;
  update touches set status = 'drafted', sent_at = null where id = p_touch_id returning * into t;
  perform recount_contact_touches(t.contact_id);
  return t;
end $$;
