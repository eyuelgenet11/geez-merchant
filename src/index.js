import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Change this from Dashboard to App
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);