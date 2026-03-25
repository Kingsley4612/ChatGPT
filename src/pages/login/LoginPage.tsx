import { useState } from 'react';

interface Props {
  onLogin: (payload: { account: string; password: string; org: string }) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [org, setOrg] = useState('风控部');

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: 360 }}>
        <h2>在线分析中心登录</h2>
        <input placeholder="账号" value={account} onChange={(e) => setAccount(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <input placeholder="组织机构" value={org} onChange={(e) => setOrg(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
        <button onClick={() => onLogin({ account, password, org })} style={{ width: '100%' }}>登录</button>
      </div>
    </div>
  );
}
