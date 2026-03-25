import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState } from 'react';
import { AnalysisCenterPage } from './pages/analysis-center/AnalysisCenterPage';
import { WorkbookPage } from './pages/workbook/WorkbookPage';
import { MyAnalysisPage } from './pages/my-analysis/MyAnalysisPage';
import { LoginPage } from './pages/login/LoginPage';
import './styles.css';
import { getCurrentUser, login, logout } from './services/security.service';

type Route =
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'workbook'; datasetId: string }
  | { name: 'my-analysis' };

function App() {
  const [route, setRoute] = useState<Route>(() => (getCurrentUser().userId ? { name: 'home' } : { name: 'login' }));

  if (route.name === 'login') {
    return (
      <LoginPage
        onLogin={(payload) => {
          login(payload);
          setRoute({ name: 'home' });
        }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', color: 'white' }}>
        <span>在线分析中心</span>
        <button
          onClick={() => {
            logout();
            setRoute({ name: 'login' });
          }}
          style={{ background: '#334155' }}
        >
          退出登录
        </button>
      </div>
      {route.name === 'home' ? (
        <AnalysisCenterPage
          onOpenDataset={(datasetId) => setRoute({ name: 'workbook', datasetId })}
          onOpenMyAnalysis={() => setRoute({ name: 'my-analysis' })}
        />
      ) : null}
      {route.name === 'my-analysis' ? <MyAnalysisPage onBack={() => setRoute({ name: 'home' })} /> : null}
      {route.name === 'workbook' ? <WorkbookPage datasetId={route.datasetId} onBack={() => setRoute({ name: 'home' })} /> : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
