import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'semantic-ui-css/semantic.min.css';
import './App.css';
import Layout from './components/Layout';
import { TOOLS } from './tools';

const enabledTools = TOOLS.filter((t) => !t.disabled);

const App = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Routes>
      <Route element={<Layout tools={TOOLS} />}>
        {enabledTools.map(({ path, element, keepAlive }) => (
          // keepAlive tools are rendered by Layout; the route only makes the URL valid
          <Route key={path} path={path} element={keepAlive ? null : element} />
        ))}
        <Route path='*' element={<Navigate to={`/${enabledTools[0].path}`} replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
