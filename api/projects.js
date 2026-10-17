const { db, auth } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  const user = await auth(req, res); if (!user) return;
  try {
    if (req.method === 'GET') {
      const { data, error } = await db.from('projects').select('id,name,data,updated_at').eq('tg_id', user.id).order('updated_at', { ascending: false });
      if (error) throw error;
      return res.json({ user: { id: user.id, name: user.first_name }, projects: data });
    }
    if (req.method === 'POST') {
      const { id, name, data } = req.body || {};
      if (!UUID.test(id) || typeof name !== 'string' || !name.trim() || name.length > 80 || typeof data !== 'object') return res.status(400).json({ error: 'bad request' });
      if (JSON.stringify(data).length > 200000) return res.status(413).json({ error: 'too large' });
      const { data: ex } = await db.from('projects').select('tg_id').eq('id', id).maybeSingle();
      if (ex && ex.tg_id !== user.id) return res.status(403).json({ error: 'forbidden' });
      const row = { id, tg_id: user.id, name: name.trim(), data, updated_at: new Date().toISOString() };
      const { error } = await db.from('projects').upsert(row);
      if (error) throw error;
      return res.json({ updated_at: row.updated_at });
    }
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!UUID.test(id)) return res.status(400).json({ error: 'bad request' });
      const { error } = await db.from('projects').delete().eq('id', id).eq('tg_id', user.id);
      if (error) throw error;
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
};
