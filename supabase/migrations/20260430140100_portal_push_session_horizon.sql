-- Calendar horizon for Web Push dispatch (London business day), aligned with staff dashboard reminder window.

begin;

create or replace function public.portal_session_date_in_push_horizon(p_session date)
returns boolean
language sql
stable
as $$
  select p_session >= (timezone('Europe/London', now()))::date
     and p_session <= ((timezone('Europe/London', now()))::date + 14);
$$;

comment on function public.portal_session_date_in_push_horizon(date) is
  'True when session_date is today..today+14 in Europe/London (roster push horizon).';

grant execute on function public.portal_session_date_in_push_horizon(date) to service_role;

commit;
