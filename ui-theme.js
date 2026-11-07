// Light / dark look of the editor itself (not of the page being built). Remembered in this browser.
import { t } from './i18n.js';

const KEY = 'oc-ui-theme';
const get = () => { try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
const apply = mode => { document.documentElement.dataset.ui = mode; btn.textContent = mode === 'light' ? '☾' : '☀'; btn.title = t(mode === 'light' ? 'Dark editor' : 'Light editor'); };

const btn = document.createElement('button');
btn.type = 'button'; btn.className = 'sb-item sb-ui'; btn.id = 'uiTheme';
btn.onclick = () => { const next = get() === 'light' ? 'dark' : 'light'; try { localStorage.setItem(KEY, next); } catch {} apply(next); };
apply(get());
document.getElementById('sbLang')?.before(btn);

export const uiTheme = { get, set: m => { try { localStorage.setItem(KEY, m); } catch {} apply(m); } };
