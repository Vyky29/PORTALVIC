-- Store the browser IP on each announcement signature.
-- Older rows stay empty: the IP is only known on the insert request.

begin;

alter table public.portal_staff_announcement_acks
  add column if not exists client_ip text null;

comment on column public.portal_staff_announcement_acks.client_ip is
  'Public IP of the browser that signed. Stamped on insert from the request. Rows signed before this column have no IP.';

create or replace function public.portal_announcement_ack_stamp_ip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json;
  ip text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  if headers is not null then
    ip := coalesce(
      nullif(headers->>'cf-connecting-ip', ''),
      nullif(headers->>'x-real-ip', ''),
      nullif(headers->>'x-forwarded-for', '')
    );
    if ip is not null and position(',' in ip) > 0 then
      ip := btrim(split_part(ip, ',', 1));
    end if;
  end if;
  if ip is not null and ip <> '' then
    new.client_ip := left(ip, 64);
  end if;
  return new;
end;
$$;

drop trigger if exists portal_announcement_ack_stamp_ip on public.portal_staff_announcement_acks;
create trigger portal_announcement_ack_stamp_ip
  before insert on public.portal_staff_announcement_acks
  for each row
  execute function public.portal_announcement_ack_stamp_ip();

commit;
