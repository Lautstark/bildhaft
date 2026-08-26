import { mountApp } from './app.ts';
import { LANG } from './i18n/index.ts';
import { setSymbolLanguage } from '@lautstark/bildquelle';
import { initTheme } from '@lautstark/design/theme';
import '@lautstark/design/tokens/bildhaft.css';
import '@lautstark/design/components.css';
import './styles/app.css';
import './styles/print.css';

// After the token import above, so getComputedStyle can read the --bg this
// paints the address bar from; the attribute itself is already set by the
// inline script in index.html, so nothing here changes what is on screen.
initTheme('bildhaft.theme');

/* index.html ships lang="de" because that is what the file can know before any
 * script runs. What the reader actually chose is only known here, and the
 * attribute matters beyond tidiness: it is what a screen reader picks a voice
 * from, and an English sentence read out by a German voice is worse than
 * untranslated. */
document.documentElement.lang = LANG;

/* The symbol sources search in the same language the page is written in.
 *
 * Two halves have to agree here and it is easy to move only one: i18n/pipeline.ts
 * picks which lemmatiser reads the sentence, and this picks which ARASAAC
 * endpoint is asked for the words it produces. Wiring the pipeline alone leaves
 * an English page asking the German endpoint - which does not refuse an English
 * word, it answers one, so the page looks like it works and shows the wrong
 * picture. That is the failure this whole change started from, and the e2e spec
 * that watches the request paths is what caught it happening again here. */
setSymbolLanguage(LANG);

mountApp(document.getElementById('root')!);
