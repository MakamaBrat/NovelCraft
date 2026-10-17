// Webhook бота: /start присылает кнопку запуска Mini App
module.exports = async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const m = req.body && req.body.message;
  if (m && m.text && m.text.startsWith('/start')) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: m.chat.id, text: 'Создавай свои визуальные новеллы ✨',
        reply_markup: { inline_keyboard: [[{ text: '✦ Открыть NovelCraft', web_app: { url: process.env.APP_URL } }]] } })
    });
  }
  res.json({ ok: true });
};
