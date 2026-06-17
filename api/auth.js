const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username e password obrigatórios' });
  }
  const result = await authenticate(username, password);
  if (!result) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  res.json(result);
};
