import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export async function authenticateAccount(account, password, org) {
  const normalizedAccount = String(account ?? '').trim().toLowerCase();
  const normalizedPassword = String(password ?? '');

  const result = await query(
    `
      SELECT user_id, account, password, user_name, department, role_codes, capabilities
      FROM users
      WHERE LOWER(account) = $1
      LIMIT 1
    `,
    [normalizedAccount],
  );

  const row = result.rows[0];
  if (!row || row.password !== normalizedPassword) {
    throw new Error('账号或密码错误');
  }

  return {
    userId: row.user_id,
    userName: row.user_name,
    department: String(org ?? '').trim() || row.department,
    roleCodes: row.role_codes ?? ['analyst'],
    capabilities: row.capabilities ?? {
      canCopy: true,
      canSaveView: true,
      canSaveWorkbook: true,
    },
  };
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.userId,
      userName: user.userName,
      department: user.department,
      roleCodes: user.roleCodes,
      capabilities: user.capabilities,
    },
    config.jwtSecret,
    { expiresIn: '12h' },
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({ message: '缺少访问令牌' });
    return;
  }

  try {
    const decoded = jwt.verify(match[1], config.jwtSecret);
    req.user = {
      userId: decoded.sub,
      userName: decoded.userName,
      department: decoded.department,
      roleCodes: decoded.roleCodes ?? [],
      capabilities: decoded.capabilities ?? {},
    };
    next();
  } catch (error) {
    res.status(401).json({ message: '访问令牌无效' });
  }
}
