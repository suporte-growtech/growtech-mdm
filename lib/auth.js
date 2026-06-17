const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'growtech-mdm-segredo';

async function authenticate(username, password) {
  const { data, error } = await supabase
    .rpc('authenticate_user', { p_username: username, p_password: password });

  if (error || !data) return null;

  const token = jwt.sign(
    { id: data.id, username: data.username, role: data.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user: { id: data.id, username: data.username, role: data.role } };
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    next();
  };
}

module.exports = { authenticate, verifyToken, requireRole };
