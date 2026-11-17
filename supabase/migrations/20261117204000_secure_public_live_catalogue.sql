-- Make the public catalogue view run with caller permissions and explicit RLS.
grant select on public.omnisight_publications to anon, authenticated;
drop policy if exists "read publications for eligible lots" on public.omnisight_publications;
create policy "read publications for eligible lots"
on public.omnisight_publications
for select to anon, authenticated
using (
  exists (
    select 1 from public.omnisight_discovered_lots d
    join public.omnisight_lot_sources s on s.id=d.source_id
    where d.id=omnisight_publications.discovered_lot_id
      and d.listing_status in ('active','upcoming')
      and d.published_value_usd >= 500000
      and d.value_source_url is not null and d.value_checked_at is not null
      and d.verification_status in ('source_checked','human_reviewed')
      and d.data_use_status in ('licensed','public_domain','permission_granted')
      and d.rights_reference is not null and d.rights_reviewed_at is not null
      and s.enabled=true and s.access_status='approved'
      and s.automated_access_allowed=true
      and s.terms_status in ('permitted','licensed','permission_granted')
  )
);
grant select on public.omnisight_lot_sources to anon, authenticated;
drop policy if exists "read approved automated lot sources" on public.omnisight_lot_sources;
create policy "read approved automated lot sources"
on public.omnisight_lot_sources
for select to anon, authenticated
using (
  enabled=true and access_status='approved' and automated_access_allowed=true
  and terms_status in ('permitted','licensed','permission_granted')
);
create or replace view public.omnisight_public_live_lots
with (security_barrier=true, security_invoker=true)
as
select
  d.id,d.title,d.asset_class,d.make,d.model,d.model_year,d.lot_number,d.sale_date,
  d.location,d.estimate_low,d.estimate_high,d.auction_house,d.canonical_url,
  d.listing_status,d.published_value_usd,d.currency,d.value_basis,d.value_source_url,
  d.value_checked_at,d.auction_starts_at,d.auction_ends_at,d.hero_image_url,d.image_urls,
  d.image_usage_status,d.image_rights_reference,d.image_rights_reviewed_at,
  d.short_factual_summary,d.verification_status,d.data_use_status,d.rights_reference,
  d.rights_reviewed_at,d.last_seen_at,a.current_bid,a.reserve,a.category,a.creator,
  a.status as auction_status,p.published_at
from public.omnisight_publications p
join public.omnisight_discovered_lots d on d.id=p.discovered_lot_id
join public.omnisight_lot_sources s on s.id=d.source_id
join public.auctions a on a.id=p.auction_id
where d.listing_status in ('active','upcoming')
  and d.published_value_usd >= 500000
  and d.value_source_url is not null and d.value_checked_at is not null
  and d.verification_status in ('source_checked','human_reviewed')
  and d.data_use_status in ('licensed','public_domain','permission_granted')
  and d.rights_reference is not null and d.rights_reviewed_at is not null
  and s.enabled=true and s.access_status='approved' and s.automated_access_allowed=true
  and s.terms_status in ('permitted','licensed','permission_granted')
  and a.creator='OmniSight · verified source'
  and a.status in ('live','upcoming') and a.reserve >= 500000
  and (a.ends_at is null or a.ends_at > now());
revoke all on public.omnisight_public_live_lots from public;
grant select on public.omnisight_public_live_lots to anon, authenticated;
revoke all on function public.omnisight_publish_eligible_lots() from public, anon, authenticated;
grant execute on function public.omnisight_publish_eligible_lots() to service_role;
