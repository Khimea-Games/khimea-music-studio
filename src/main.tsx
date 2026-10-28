import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { BrandSplash } from './components/layout/BrandSplash.tsx';
import './index.css';

// Guard against third-party extension injection rejections (e.g. MetaMask, phantom wallet)
window.addEventListener('unhandledrejection', (event) => {
  const reason = (event.reason?.message || event.reason?.stack || String(event.reason || '')).toLowerCase();
  if (
    reason.includes('metamask') ||
    reason.includes('ethereum') ||
    reason.includes('wallet') ||
    reason.includes('extension') ||
    reason.includes('chrome-extension')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

window.addEventListener('error', (event) => {
  const msg = (event.message || '').toLowerCase();
  const filename = (event.filename || '').toLowerCase();
  if (
    msg.includes('metamask') ||
    msg.includes('ethereum') ||
    msg.includes('wallet') ||
    filename.includes('extension') ||
    filename.includes('inpage.js')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <BrandSplash />
    </ErrorBoundary>
  </StrictMode>
);
