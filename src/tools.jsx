import React, { lazy } from 'react';
import SttTool from './components/stt/SttTool';

const Transcription = lazy(() => import('./pages/Transcription'));
const Speakers = lazy(() => import('./pages/Speakers'));
const DocDiff = lazy(() => import('./pages/DocDiff'));
const TextDiff = lazy(() => import('./pages/TextDiff'));
const Stt = lazy(() => import('./pages/Stt'));
const Align = lazy(() => import('./pages/Align'));
const Review = lazy(() => import('./pages/Review'));
const Compare = lazy(() => import('./pages/Compare'));

// To add a tool, add an entry here: it gets a route and a menu item.
// A tool owns everything under its path (e.g. /review/...).
// disabled: shown greyed out in the menu, no route. sttApi: needs stt-api (shows its health in the menu).
// keepAlive: once opened, stays mounted (hidden) while other tools are shown -- for pages that
// hold a session (Keycloak init, MQTT connection, running job) and can't be remounted.
export const TOOLS = [
  { path: 'transcription', title: 'Transcription', element: <Transcription />, keepAlive: true },
  { path: 'speakers', title: 'Speakers', element: <Speakers />, sttApi: true, disabled: true },
  { path: 'docdiff', title: 'Doc diff', element: <SttTool><DocDiff /></SttTool>, sttApi: true, disabled: true },
  { path: 'textdiff', title: 'Text diff', element: <TextDiff />, sttApi: true, disabled: true },
  { path: 'stt', title: 'תמלול', element: <SttTool><Stt /></SttTool> },
  { path: 'align', title: 'תזמון מילים', element: <SttTool><Align /></SttTool>, disabled: true },
  { path: 'review', title: 'בדיקת תמלול', element: <SttTool><Review /></SttTool> },
  { path: 'compare', title: 'השוואת תמלול', element: <SttTool><Compare /></SttTool> },
];

export const isToolEnabled = (path) => TOOLS.some((t) => t.path === path && !t.disabled);
