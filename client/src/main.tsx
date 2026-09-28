import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/Auth';
import { SiteProvider } from './context/SiteContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { I18nProvider, isEn } from './lib/i18n';
import './styles/index.css';

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <SiteProvider>
            <AuthProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthProvider>
          </SiteProvider>
        </ToastProvider>
      </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

// الإنجليزية: نحمّل القاموس ونبدأ الترجمة قبل الرسم الأول (العربية لا تحمّل شيئًا إضافيًا)
if (isEn()) import('./lib/i18n/domTranslate').then((m) => m.startDomTranslation()).finally(render);
else render();
