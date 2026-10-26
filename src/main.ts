import css from './ui/style.css?inline';
import { App } from './app';

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const root = document.getElementById('app')!;
const app = new App(root);
// accessibile dalla console (e dai test automatici)
(window as unknown as { jbonk: App }).jbonk = app;
