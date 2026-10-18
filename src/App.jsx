import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Icon, Menu } from 'semantic-ui-react';
import 'semantic-ui-css/semantic.min.css';
import './App.css';
import SttTool from './stt/SttTool';
import { sttHealth } from './AITools/stt';

const Transcription = lazy(() => import('./AITools/Transcription'));
const Speakers = lazy(() => import('./AITools/Speakers'));
const TextDiff = lazy(() => import('./AITools/TextDiff'));
const UploadPage = lazy(() => import('./stt/pages/UploadPage'));
const SttPage = lazy(() => import('./stt/pages/SttPage'));
const AlignPage = lazy(() => import('./stt/pages/AlignPage'));

// To add a tool, add an entry here: it gets a route and a menu item.
const TOOLS = [
  { path: 'transcription', title: 'Transcription', element: <Transcription /> },
  { path: 'speakers', title: 'Speakers', element: <Speakers /> },
  { path: 'docdiff', title: 'Doc diff', element: <SttTool><UploadPage /></SttTool> },
  { path: 'textdiff', title: 'Text diff', element: <TextDiff /> },
  { path: 'stt', title: 'תמלול', element: <SttTool><SttPage /></SttTool> },
  { path: 'align', title: 'תזמון מילים', element: <SttTool><AlignPage /></SttTool> },
];

const HEALTH_INTERVAL_MS = 60000;

const SttApiStatus = () => {
  const [alive, setAlive] = useState(null);

  useEffect(() => {
    const check = () => sttHealth().then(() => setAlive(true), () => setAlive(false));
    check();
    const id = setInterval(check, HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const color = alive === null ? 'grey' : alive ? 'green' : 'red';
  return (
    <Menu.Item title={alive === false ? 'STT API is unreachable' : undefined}>
      <Icon name='circle' color={color} />STT API
    </Menu.Item>
  );
};

const Layout = () => (
  <>
    <Menu attached='top'>
      {TOOLS.map(({ path, title }) => (
        <Menu.Item key={path} as={NavLink} to={`/${path}`} content={title} />
      ))}
      <Menu.Menu position='right'>
        <SttApiStatus />
      </Menu.Menu>
    </Menu>
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  </>
);

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        {TOOLS.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
        <Route path='*' element={<Navigate to={`/${TOOLS[0].path}`} replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
