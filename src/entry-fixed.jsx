import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './AppFixed.jsx';

window.addEventListener('DOMContentLoaded', () => {
  createRoot(document.getElementById('root')).render(<App />);
});
