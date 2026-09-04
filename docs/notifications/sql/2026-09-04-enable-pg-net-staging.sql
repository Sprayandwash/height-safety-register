-- Staging prerequisite for the inactive routine task-push scheduler.
-- Applied to isolated Staging project tsnmbvezrweciaitkquf on 2026-09-04.
-- Required because the scheduler uses net.http_post to invoke the Edge Function.
create extension if not exists pg_net;
