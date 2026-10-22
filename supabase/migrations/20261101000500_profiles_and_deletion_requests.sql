-- Profile phone numbers are stored canonically in Burkina Faso format.
alter table public.profiles
  add constraint profiles_phone_burkina_check
  check (phone is null or phone ~ '^\+226[0-9]{8}$');

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  processed_at timestamptz,
  check (
    (status in ('pending', 'processing') and processed_at is null)
    or (status in ('completed', 'failed') and processed_at is not null)
  )
);

create unique index account_deletion_requests_active_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('pending', 'processing');

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant insert (user_id) on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

create policy account_deletion_requests_select_own
  on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy account_deletion_requests_insert_own
  on public.account_deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy profile_avatars_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'profile-avatars');
create policy profile_avatars_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy profile_avatars_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy profile_avatars_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
