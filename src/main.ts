import css from './ui/style.css?inline';
import { App } from './app';
import { Atlas } from './render/atlas';

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const root = document.getElementById('app')!;
// l'atlas aspetta le immagini dei loghi (incluse nel bundle, quindi è questione di millisecondi)
void Atlas.create().then((atlas) => {
  const app = new App(root, atlas);
  // accessibile dalla console (e dai test automatici)
  (window as unknown as { jbonk: App }).jbonk = app;
});
