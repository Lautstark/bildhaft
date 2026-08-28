import { el } from './dom.ts';
import { openDialog } from './dialog.ts';
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

function page(title: string, html: string, onClose: () => void): void {
  openDialog({ title, body: [el('div', { html })], onClose });
}

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

export function openAbout(onClose: () => void): void {
  page(t('info.about_title'), [
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
  ].join(''), onClose);
}

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
export function openImpressum(onClose: () => void): void {
  page(t('ui.impressum'), [
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
  ].join(''), onClose);
}

/**
 * The information Article 13 GDPR asks for. It gets by without the usual
 * boilerplate because almost nothing happens here: there is no server for
 * anything to land on. What still has to be named is what the host logs, and
 * that an ARASAAC request carries the IP address with it.
 */
export function openDatenschutz(onClose: () => void): void {
  page(t('ui.privacy'), [
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
    h3(t('info.storage')),
    para(t('info.storage_body')),
    h3(t('info.not_happening')),
    para(t('info.not_happening_body')),
    h3(t('info.rights')),
    para(t('info.rights_body')),
    `<p style="margin:18px 0 0;color:var(--text-faint)">${t('info.updated')}</p>`,
  ].join(''), onClose);
}
