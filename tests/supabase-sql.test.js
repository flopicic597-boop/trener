// Провјера supabase/setup.sql на правом PostgreSQL-у (PGlite), уз минималне замјене за
// Supabase шеме auth и storage. Провјерава: покретање (и поновно), RLS између два налога,
// анонимни приступ, „само новија верзија“ при слању и приватност фасцикле прилога.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';

const STUB = `
create role anon; create role authenticated;
create schema auth; create schema storage;
grant usage on schema public, auth, storage to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (bucket_id text, name text, primary key (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
insert into auth.users values ('${A}'), ('${B}');
`;

let db;
async function as(user, fn) {
  await db.exec(user ? `set role authenticated; set request.jwt.claim.sub = '${user}';` : `set role anon; set request.jwt.claim.sub = '';`);
  try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
}
const push = (recs) => db.query('select * from public.trener_push($1::jsonb)', [JSON.stringify(recs)]);
const rec = (id, updated_at, payload, deleted = false) => ({ tbl: 'clients', id, updated_at, payload, deleted });

describe('supabase/setup.sql', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUB);
    await db.exec(SQL);
    await db.exec(SQL); // поновно покретање не смије пасти
  }, 60000);

  it('слање: нови запис, новија верзија се прихвата, старија се одбија', async () => {
    await as(A, async () => {
      expect((await push([rec('c1', '2026-11-19T10:00:00Z', 'v1')])).rows).toEqual([]);
      expect((await push([rec('c1', '2026-11-19T11:00:00Z', 'v2')])).rows).toEqual([]);
      const rejected = await push([rec('c1', '2026-11-19T09:00:00Z', 'stara')]);
      expect(rejected.rows).toEqual([{ r_tbl: 'clients', r_id: 'c1' }]);
      const r = await db.query("select payload, deleted from public.trener_records where id = 'c1'");
      expect(r.rows).toEqual([{ payload: 'v2', deleted: false }]);
      await push([rec('c1', '2026-11-19T12:00:00Z', 'v3', true)]);
      expect((await db.query("select deleted from public.trener_records where id = 'c1'")).rows[0].deleted).toBe(true);
    });
  });

  it('други налог не види и не мијења туђе записе', async () => {
    await as(B, async () => {
      expect((await db.query('select * from public.trener_records')).rows).toEqual([]);
      await push([rec('c1', '2030-01-01T00:00:00Z', 'B-ov')]); // исти id, али свој ред
      await expect(db.query(`insert into public.trener_records (user_id, tbl, id, updated_at, payload) values ('${A}', 'clients', 'x', now(), 'p')`)).rejects.toThrow();
      await db.query('delete from public.trener_records where true');
    });
    await as(A, async () => {
      const r = await db.query("select payload from public.trener_records where id = 'c1'");
      expect(r.rows).toEqual([{ payload: 'v3' }]);
    });
  });

  it('анонимни приступ је забрањен', async () => {
    await as(null, async () => {
      await expect(db.query('select * from public.trener_records')).rejects.toThrow();
      await expect(push([rec('z', '2026-11-19T10:00:00Z', 'p')])).rejects.toThrow();
    });
  });

  it('кључ (со) по налогу и приватна фасцикла прилога', async () => {
    await as(A, async () => {
      await db.query("insert into public.trener_keys (salt, check_val) values ('s', 'c')");
      await db.query(`insert into storage.objects (bucket_id, name) values ('trener-prilozi', '${A}/att1')`);
      await expect(db.query(`insert into storage.objects (bucket_id, name) values ('trener-prilozi', '${B}/att1')`)).rejects.toThrow();
    });
    await as(B, async () => {
      expect((await db.query('select * from public.trener_keys')).rows).toEqual([]);
      expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    });
    expect((await db.query("select public from storage.buckets where id = 'trener-prilozi'")).rows[0].public).toBe(false);
  });

  it('ограничење величине пакета', async () => {
    await as(A, async () => {
      const many = Array.from({ length: 501 }, (_, i) => rec('m' + i, '2026-11-19T10:00:00Z', 'p'));
      await expect(push(many)).rejects.toThrow(/at most 500/);
    });
  });
});
