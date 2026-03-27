import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { AnalysisCenterPage } from './pages/analysis-center/AnalysisCenterPage';
import { WorkbookPage } from './pages/workbook/WorkbookPage';
import { MyAnalysisPage } from './pages/my-analysis/MyAnalysisPage';
import { LoginPage } from './pages/login/LoginPage';
import './styles.css';
import { getCurrentUser, login, logout } from './services/security.service';

type Route =
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'workbook'; datasetId: string; workbookId?: string }
  | { name: 'my-analysis' };

function App() {
  const [route, setRoute] = useState<Route>(() => (getCurrentUser().userId ? { name: 'home' } : { name: 'login' }));

  if (route.name === 'login') {
    return (
      <LoginPage
        onLogin={async (payload) => {
          await login(payload);
          setRoute({ name: 'home' });
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="eyebrow">Internal Use Only</div>
          <span className="topbar-title">在线分析中心</span>
        </div>
        <button
          className="button-secondary"
          onClick={() => {
            logout();
            setRoute({ name: 'login' });
          }}
        >
          退出登录
        </button>
      </div>
      {route.name === 'home' ? (
        <AnalysisCenterPage
          onOpenDataset={(datasetId) => setRoute({ name: 'workbook', datasetId })}
          onCreateBlankWorkbook={(datasetId) => setRoute({ name: 'workbook', datasetId })}
          onOpenWorkbook={(workbookId, datasetId) => setRoute({ name: 'workbook', datasetId, workbookId })}
          onOpenMyAnalysis={() => setRoute({ name: 'my-analysis' })}
        />
      ) : null}
      {route.name === 'my-analysis' ? <MyAnalysisPage onBack={() => setRoute({ name: 'home' })} onOpenWorkbook={(workbookId, datasetId) => setRoute({ name: 'workbook', datasetId, workbookId })} /> : null}
      {route.name === 'workbook' ? (
        <WorkbookPage
          datasetId={route.datasetId}
          workbookId={route.workbookId}
          onBack={() => {
            if (route.workbookId) {
              setRoute({ name: 'my-analysis' });
              return;
            }
            setRoute({ name: 'home' });
          }}
        />
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
