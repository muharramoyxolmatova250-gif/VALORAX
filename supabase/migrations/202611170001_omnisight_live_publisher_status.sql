-- The publisher stores image rights review separately from text/data rights.
alter table public.omnisight_discovered_lots
  add column if not exists image_rights_reviewed_at timestamptz;

-- Keep the existing strict eligibility policy, but preserve upcoming/live state
-- when publishing into the Valorax auctions table.
create or replace function public.omnisight_publish_eligible_lots()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
      and (d.auction_ends_at is null or d.auction_ends_at > now())
      and not exists (
        select 1 from public.omnisight_publications p
        where p.discovered_lot_id = d.id
      )
      and not exists (
        select 1 from public.auctions a
        where a.title = d.title
          and a.subtitle like '%' || d.canonical_url || '%'
      )
  loop
    v_category := case
      when r.asset_class ilike '%car%' or r.asset_class ilike '%vehicle%' or r.asset_class = 'automotive' then 'Hypercars'
      when r.asset_class ilike '%real_estate%' or r.asset_class ilike '%property%' then 'Real Estate'
      when r.asset_class ilike '%art%' or r.asset_class ilike '%collect%' or r.asset_class ilike '%watch%' then 'Media'
      else 'Equity'
    end;
    v_status := case
      when r.listing_status = 'upcoming'
        or (r.auction_starts_at is not null and r.auction_starts_at > now())
        then 'upcoming'
      else 'live'
    end;

    insert into public.auctions(
      title, subtitle, image, current_bid, escrow, bids_count, reserve,
      category, creator, ends_at, status
    )
    values (
      r.title,
      concat_ws(' · ',
        nullif(r.auction_house,''),
        nullif(r.location,''),
        case when r.lot_number is not null then 'Lot ' || r.lot_number end,
        r.canonical_url
      ),
      case
        when r.image_usage_status in ('licensed','permission_granted')
          and r.image_rights_reference is not null
          and r.image_rights_reviewed_at is not null
          then r.hero_image_url
        else null
      end,
      coalesce(r.realised_price,0),
      0,
      0,
      r.published_value_usd,
      v_category,
      'OmniSight · verified source',
      r.auction_ends_at,
      v_status
    )
    returning id into v_auction_id;

    insert into public.omnisight_publications(discovered_lot_id, auction_id)
    values (r.id, v_auction_id);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
