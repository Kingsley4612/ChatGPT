import { useState } from 'react';

interface Props {
  onLogin: (payload: { account: string; password: string; org: string }) => Promise<void>;
}

export function LoginPage({ onLogin }: Props) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [org, setOrg] = useState('风控部');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onLogin({ account, password, org });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-panel login-panel--hero">
        <div className="eyebrow">Internal Analytics Workspace</div>
        <h1>在线分析中心</h1>
        <p>面向内网分析场景的工作簿、视图和审计一体化演示环境。</p>
        <div className="login-highlights">
          <div className="metric-card">
            <strong>100 万</strong>
            <span>行级模拟数据分页加载</span>
          </div>
          <div className="metric-card">
            <strong>Sheet + 视图</strong>
            <span>支持个人工作簿继续编辑</span>
          </div>
        </div>
      </div>
      <div className="card login-panel login-panel--form">
        <h2>账号登录</h2>
        <p className="muted">请输入账号、密码和组织信息。</p>
        <input placeholder="账号" value={account} onChange={(e) => setAccount(e.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input placeholder="组织机构" value={org} onChange={(e) => setOrg(e.target.value)} />
        {error ? <div className="form-error">{error}</div> : null}
        <button onClick={handleLogin} style={{ width: '100%' }} disabled={submitting}>
          {submitting ? '登录中...' : '登录'}
        </button>
      </div>
    </div>
  );
}
