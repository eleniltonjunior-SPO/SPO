-- Sample routes: one region per weekday.
insert into public.regions (name, weekday, calendar_tag, color) values
  ('Region A — North',    1, '#north',    '#0d9488'),
  ('Region B — Downtown', 2, '#downtown', '#2563eb'),
  ('Region C — East',     3, '#east',     '#7c3aed'),
  ('Region D — South',    4, '#south',    '#db2777'),
  ('Region E — West',     5, '#west',     '#ea580c')
on conflict (name) do nothing;

insert into public.clients (full_name, email, phone, address, region_id, billing_type, rate)
select 'Jane Doe', 'jane@example.com', '+15551230001', '12 Oak St', id, 'flat', 140
  from public.regions where calendar_tag = '#north'
on conflict do nothing;
