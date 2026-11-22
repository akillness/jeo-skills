import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import HeroPosterPage from './hero/hero-poster-page';
import './styles/app.css';

// `?poster=<look>` renders the bare hero used by the capture pipeline to shoot the poster stills;
// every other URL renders the landing page.
const look = new URLSearchParams(window.location.search).get('poster');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root missing');
createRoot(rootElement).render(
  <StrictMode>{look ? <HeroPosterPage look={look} /> : <App />}</StrictMode>,
);
