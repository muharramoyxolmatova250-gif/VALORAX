-- Run the rights-aware publisher every minute so newly eligible lots appear promptly.
-- The publisher remains the only path into the public auction catalogue.
select cron.schedule(
  'valorax-omnisight-live-publisher',
  '* * * * *',
  'select public.omnisight_publish_eligible_lots();'
);
