/**
 * The three pages the footer opens: what this is, the Impressum, and the
 * privacy notice.
 *
 * They are **one** dialog with three sections in it, which is
 * `@lautstark/design/svelte/Legal` and conventions.md §6.12. Until 2026-09-17
 * this file made three `openSheet` calls that differed only in their prose —
 * three sheets, and so three chances for one of them to be reachable and the
 * others not, which is the exact failure both legal pages are required
 * against. What is left here is the prose and the addresses in it; the frame,
 * the heading that names whichever page is showing, and the hiding of the two
 * that are not, are the component's.
 */
import { t } from '../i18n/index.ts';

const REPO = 'https://github.com/Lautstark/bildhaft';
const ORG = 'https://github.com/Lautstark';
const MITREDEN = 'https://lautstark.github.io/mitreden/';
const ISSUES = 'https://github.com/Lautstark/bildhaft/issues';

/** The one line to change if a different address should be public. */
const EMAIL = 'steffi@lautstark.tech';

/** Every external link in these pages opens in a new tab and tells the browser so. */
const ext = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noreferrer noopener">${text}</a>`;

const h3 = (text: string, first = false) =>
  `<h3 style="font-size:14px;margin:${first ? '0' : '18px'} 0 6px">${text}</h3>`;

/** Which of the three is showing. `null` closes the dialog. */
export type LegalKey = 'about' | 'impressum' | 'privacy';

/** One page: what `Legal` needs to name it, and the prose it draws.
 *
 * `{@html}` rather than markup, as before: the pages are sentences with links
 * inside them, built below, and a component per paragraph would be a
 * translation table spread across three files. */
export interface InfoPage { key: LegalKey; title: string; id: string; html: string }

/**
 * The `<section>`'s id, and it is load-bearing from the day the three sheets
 * became one dialog.
 *
 * All three sections are in the document together and the two not showing are
 * `hidden` — which is `Legal`'s shape and the right one — so the dialog's own
 * text is now the text of all three pages at once. `legal.spec.ts` is the gate
 * on § 5 DDG and Art. 13 DSGVO: asked of the dialog, „Stefanie Grewenig" and
 * „21149 Hamburg" would be found in the privacy notice and the Impressum could
 * be empty, and `a[href^="mailto:"]` genuinely matched twice. Asked of the
 * section, each claim is about the page it is a claim about. Same three names
 * vorlaut uses, since this is the same arrangement.
 */
const page = (key: LegalKey, title: string, parts: string[]): InfoPage =>
  ({ key, title, id: `${key}Page`, html: parts.join('') });

/**
 * What the footer used to try to say in five words. It has room here to be
 * accurate about the one thing that does leave the browser, which the old
 * footer line quietly rounded off.
 */
/*
 * The three pages are prose, and the prose lives in the text table like every
 * other string here. What does NOT live there is a single URL: the links are
 * built in this file and dropped into the sentences through placeholders.
 *
 * That is the same rule vorlaut's texts.ts states and for the same reason. Every
 * other value out of the table reaches the page as text, which is inert whatever
 * it says; an href is the one thing that is not. Keeping addresses out of the
 * translated half means a translation can never introduce one.
 */
const para = (html: string, first = false) =>
  `<p style="margin:${first ? '0 0 0' : '0'}">${html}</p>`;

const about = (): InfoPage =>
  page('about', t('info.about_title'), [
    para(t('info.about_lead'), true),
    h3(t('info.about_leaves')),
    para(t('info.about_leaves_body')),
    h3(t('info.about_symbols')),
    para(t('info.about_symbols_body', { arasaac: ext('https://arasaac.org', 'ARASAAC') })),
    h3(t('info.about_source')),
    para(t('info.about_source_body', {
      repo: ext(REPO, 'github.com/Lautstark/bildhaft'),
      org: ext(ORG, 'Lautstark'),
      mitreden: ext(MITREDEN, 'mitreden'),
    })),
  ]);

/**
 * The details § 5 DDG asks for. bildhaft is not a trade, so there is no register
 * entry and no VAT id — a name, an address and two ways of reaching somebody
 * directly are all that is required.
 *
 * The page keeps its German name in both languages. § 5 DDG asks that it be easy
 * to recognise as the page it is, and "Impressum" is the word the law names;
 * vorlaut made the same call for the same reason. Its neighbour did not, because
 * nothing names the privacy page — Article 13 requires the information, not a
 * word on a button.
 */
const impressum = (): InfoPage =>
  page('impressum', t('ui.impressum'), [
    h3(t('info.imprint_details'), true),
    para('Stefanie Grewenig<br>Talheide 5<br>21149 Hamburg<br>' + t('info.germany')),
    h3(t('info.contact')),
    para(t('info.contact_body', {
      email: `<a href="mailto:${EMAIL}">${EMAIL}</a>`,
      issues: ext(ISSUES, 'github.com/Lautstark/bildhaft/issues'),
    })),
    h3(t('info.responsible')),
    para(t('info.responsible_body')),
    h3(t('info.imprint_symbols')),
    para(t('info.imprint_symbols_body', { arasaac: ext('https://arasaac.org', 'ARASAAC') })),
    h3(t('info.links')),
    para(t('info.links_body')),
    h3(t('info.disputes')),
    para(t('info.disputes_body')),
  ]);

/**
 * The information Article 13 GDPR asks for. It gets by without the usual
 * boilerplate because almost nothing happens here: there is no server for
 * anything to land on. What still has to be named is what the host logs, and
 * that an ARASAAC request carries the IP address with it.
 */
const privacy = (): InfoPage =>
  page('privacy', t('ui.privacy'), [
    para(t('info.privacy_lead'), true),
    h3(t('info.controller')),
    para(`Stefanie Grewenig, Talheide 5, 21149 Hamburg, ${t('info.germany')}<br>`
      + `<a href="mailto:${EMAIL}">${EMAIL}</a>`),
    h3(t('info.hosting')),
    para(t('info.hosting_body')),
    h3(t('info.arasaac_requests')),
    para(t('info.arasaac_requests_body', {
      arasaac: ext('https://arasaac.org', 'arasaac.org'),
    })),
    h3(t('info.shelf')),
    para(t('info.shelf_body')),
    h3(t('info.storage')),
    para(t('info.storage_body')),
    h3(t('info.not_happening')),
    para(t('info.not_happening_body')),
    h3(t('info.rights')),
    para(t('info.rights_body')),
    `<p style="margin:18px 0 0;color:var(--text-faint)">${t('info.updated')}</p>`,
  ]);

/**
 * All three, in the order they are drawn — which is the order of the buttons
 * in the footer.
 *
 * Built once, at first ask. The prose is a constant in the bundle: `t()` reads
 * a table and the language of the page cannot change without a reload
 * (i18n/index.ts), so there is nothing here that could go stale between two
 * openings. Lazily all the same, so that importing this file does not build
 * three pages of HTML on the way to the first paint.
 */
let built: InfoPage[] | null = null;
export const infoPages = (): InfoPage[] => (built ??= [about(), impressum(), privacy()]);
