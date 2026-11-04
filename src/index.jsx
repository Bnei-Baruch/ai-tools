import React from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import App from './App';
import { initAuth } from './api/UserManager';

initAuth().catch((err) => console.error('Keycloak init failed', err));

const root = createRoot(document.getElementById('root'));
root.render(<App />);
