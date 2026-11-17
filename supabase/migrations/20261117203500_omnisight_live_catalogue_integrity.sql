-- Repair the missing per-lot image review timestamp used by the publisher.
alter table public.omnisight_discovered_lots
  add column if not exists image_rights_reviewed_at timestamptz;

-- Keep publication eligibility strict, but classify and publish upcoming lots correctly.
create or replace function public.omnisight_publish_eligible_lots()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  r record;
  v_auction_id uuid;
  v_count integer := 0;
  v_category text;
  v_status text;
begin
  for r in
    select d.*
    from public.omnisight_discovered_lots d
    join public.omnisight_lot_sources s on s.id = d.source_id
    where d.listing_status in ('active','upcoming')
      and coalesce(d.published_value_usd,0) >= 500000
      and d.value_source_url is not null
      and d.value_checked_at is not null
      and d.verification_status in ('source_checked','human_reviewed')
      and d.data_use_status in ('licensed','public_domain','permission_granted')
      and d.rights_reference is not null
      and d.rights_reviewed_at is not null
      and s.enabled = true
      and s.access_status = 'approved'
      and s.automated_access_allowed = true
      and s.terms_status in ('permitted','licensed','permission_granted')
      and not exists (select 1 from public.omnisight_publications p where p.discovered_lot_id = d.id)
      and not exists (
        select 1 from public.auctions a
        where a.title = d.title and a.subtitle like '%' || d.canonical_url || '%'
      )
  loop
    v_category := case
      when r.asset_class in ('automotive','hypercar','classic_car','racing_car') then 'Cars'
      when r.asset_class in ('watch') then 'Watches'
      when r.asset_class in ('jewellery','jewelry') then 'Jewelry'
      when r.asset_class in ('fine_art','sculpture') then 'Fine Art'
      when r.asset_class in ('real_estate','property') then 'Real Estate'
      when r.asset_class in ('collectible','coin') then 'Collectibles'
      when r.asset_class in ('historical_artifact','antiquity') then 'Historical'
      when r.asset_class in ('aircraft','yacht') then 'Aircraft'
      else 'Luxury'
    end;
    v_status := case
      when r.listing_status = 'upcoming'
        or (r.auction_starts_at is not null and r.auction_starts_at > now())
      then 'upcoming' else 'live'
    end;

    insert into public.auctions(
      title, subtitle, image, current_bid, escrow, bids_count, reserve,
      category, creator, ends_at, status
    )
    values (
      r.title,
      concat_ws(' · ', nullif(r.auction_house,''), nullif(r.location,''),
        case when r.lot_number is not null then 'Lot ' || r.lot_number end, r.canonical_url),
      case when r.image_usage_status in ('licensed','permission_granted')
        and r.image_rights_reference is not null
        and r.image_rights_reviewed_at is not null
        then r.hero_image_url else null end,
      coalesce(r.realised_price,0), 0, 0, r.published_value_usd,
      v_category, 'OmniSight · verified source', r.auction_ends_at, v_status
    )
    returning id into v_auction_id;

    insert into public.omnisight_publications(discovered_lot_id,auction_id)
    values (r.id,v_auction_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- Public catalogue is sourced from the publication ledger, never raw search candidates.
create or replace view public.omnisight_public_live_lots
with (security_barrier = true)
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
