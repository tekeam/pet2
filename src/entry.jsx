import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppPro.jsx';
import './styles.css';
import './mobile-reference.css';
import './mobile-extra.css';
import './pro-functional.css';

const node = document.querySelector('#root');
createRoot(node).render(React.createElement(App));