-- followups_due: count distinct outbound days instead of raw touch_count, so an inbound
-- reply or two sends on the same day don't consume the two-touch allowance.
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
    ) < 2
  order by c.last_touch_at;
