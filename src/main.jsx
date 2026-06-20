import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Self-hosted font (bundled into the build) — no external Google Fonts dependency,
// so the IPFS build makes zero third-party static fetches.
import '@fontsource/plus-jakarta-sans/300.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './styles/globals.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
