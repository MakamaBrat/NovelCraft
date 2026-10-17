module.exports = (req, res) => res.json({ bot: process.env.BOT_USERNAME || '' });
