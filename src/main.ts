import { mountApp } from './app.ts';
import '@lautstark/design/tokens/bildhaft.css';
import '@lautstark/design/components.css';
import './styles/app.css';
import './styles/print.css';

mountApp(document.getElementById('root')!);
