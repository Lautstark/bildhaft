import { mountApp } from './app.ts';
import { initTheme } from '@lautstark/design/theme';
import '@lautstark/design/tokens/bildhaft.css';
import '@lautstark/design/components.css';
import './styles/app.css';
import './styles/print.css';

// After the token import above, so getComputedStyle can read the --bg this
// paints the address bar from; the attribute itself is already set by the
// inline script in index.html, so nothing here changes what is on screen.
initTheme('bildhaft.theme');

mountApp(document.getElementById('root')!);
