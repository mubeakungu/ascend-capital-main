import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import './styles.css';

const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const Root = isAdminRoute ? AdminDashboard : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
