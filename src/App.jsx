import React, { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'semantic-ui-css/semantic.min.css';
import './App.css';
import Layout from './components/Layout';
import SttTool from './components/stt/SttTool';

const Transcription = lazy(() => import('./pages/Transcription'));
const Speakers = lazy(() => import('./pages/Speakers'));
const DocDiff = lazy(() => import('./pages/DocDiff'));
const TextDiff = lazy(() => import('./pages/TextDiff'));
const Stt = lazy(() => import('./pages/Stt'));
const Align = lazy(() => import('./pages/Align'));

// To add a tool, add an entry here: it gets a route and a menu item.
const TOOLS = [
  { path: 'transcription', title: 'Transcription', element: <Transcription /> },
  { path: 'speakers', title: 'Speakers', element: <Speakers /> },
  { path: 'docdiff', title: 'Doc diff', element: <SttTool><DocDiff /></SttTool> },
  { path: 'textdiff', title: 'Text diff', element: <TextDiff /> },
  { path: 'stt', title: 'תמלול', element: <SttTool><Stt /></SttTool> },
  { path: 'align', title: 'תזמון מילים', element: <SttTool><Align /></SttTool> },
];

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout tools={TOOLS} />}>
        {TOOLS.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
        <Route path='*' element={<Navigate to={`/${TOOLS[0].path}`} replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
