const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Проверка подписи Telegram initData (HMAC-SHA256 по токену бота)
function verify(initData) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); p.delete('hash');
  if (!hash) return null;
  const str = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(str).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

async function auth(req, res) {
  const user = verify((req.headers.authorization || '').replace(/^tma /, ''));
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return null; }
  await db.from('profiles').upsert({ tg_id: user.id, first_name: user.first_name, username: user.username || null, lang: user.language_code || null, last_seen: new Date().toISOString() });
  return user;
}
module.exports = { db, auth };
