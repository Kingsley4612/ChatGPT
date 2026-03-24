import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState } from 'react';
import { AnalysisCenterPage } from './pages/analysis-center/AnalysisCenterPage';
import { WorkbookPage } from './pages/workbook/WorkbookPage';
import { MyAnalysisPage } from './pages/my-analysis/MyAnalysisPage';
import './styles.css';

type Route =
  | { name: 'home' }
  | { name: 'workbook'; datasetId: string }
  | { name: 'my-analysis' };

function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  if (route.name === 'home') {
    return (
      <AnalysisCenterPage
        onOpenDataset={(datasetId) => setRoute({ name: 'workbook', datasetId })}
        onOpenMyAnalysis={() => setRoute({ name: 'my-analysis' })}
      />
    );
  }

  if (route.name === 'my-analysis') {
    return <MyAnalysisPage onBack={() => setRoute({ name: 'home' })} />;
  }

  return <WorkbookPage datasetId={route.datasetId} onBack={() => setRoute({ name: 'home' })} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
