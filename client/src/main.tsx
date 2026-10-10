import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { router } from './routes/router';
import { applyTheme, useUiStore } from './stores/uiStore';

const qc = new QueryClient();
applyTheme(useUiStore.getState().theme);

// Offline-first kiosk: cache the app shell so /scanner loads with no network.
// Queue flush still happens in-tab (auth token lives in memory, not in the SW).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // New worker installed while a tab is controlled = update ready.
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event('sw-update-available'));
            }
          });
        });
        // Hourly check so long-lived kiosk tabs pick up deploys.
        window.setInterval(() => {
          reg.update().catch(() => undefined);
        }, 3600 * 1000);
      })
      .catch(() => undefined);
  });
  // Activated worker takes over on reload.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
