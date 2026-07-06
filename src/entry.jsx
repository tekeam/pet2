import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const node = document.querySelector('#root');
createRoot(node).render(React.createElement(App));
