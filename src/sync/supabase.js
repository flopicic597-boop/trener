// Supabase: пријава и „backend“ за мотор синхронизације. Шаље се само шифровани садржај.
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'trener-prilozi';

export function createSupabase(url, key) {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'trener-auth', detectSessionInUrl: false },
  });
}

export function supabaseBackend(sb, userId) {
  const path = (id) => `${userId}/${id}`;
  return {
    async push(rows) {
      const { data, error } = await sb.rpc('trener_push', { records: rows });
      if (error) throw new Error('Слање на сервер: ' + error.message);
      return (data || []).map((r) => ({ tbl: r.r_tbl, id: r.r_id }));
    },
    async pull(since, limit) {
      const { data, error } = await sb.from('trener_records')
        .select('tbl,id,updated_at,deleted,payload,server_at')
        .gt('server_at', since).order('server_at', { ascending: true }).limit(limit);
      if (error) throw new Error('Преузимање са сервера: ' + error.message);
      return data || [];
    },
    async uploadFile(id, bytes) {
      const { error } = await sb.storage.from(BUCKET).upload(path(id), new Blob([bytes], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
      if (error) throw new Error('Слање прилога: ' + error.message);
    },
    async downloadFile(id) {
      const { data, error } = await sb.storage.from(BUCKET).download(path(id));
      if (error) {
        const st = error.statusCode || error.status || error.originalError?.status;
        if (String(st) === '404' || String(st) === '400' || /not.?found/i.test(error.message || '')) return null;
        throw new Error('Преузимање прилога: ' + error.message);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async deleteFile(id) { await sb.storage.from(BUCKET).remove([path(id)]); },
    async getKeyInfo() {
      const { data, error } = await sb.from('trener_keys').select('salt,check_val').maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async setKeyInfo(salt, check) {
      const { error } = await sb.from('trener_keys').insert({ salt, check_val: check });
      if (error) throw new Error(error.message);
    },
  };
}
