// Prepara artifact/index.html + artifact/game.js partendo dalla build di Vite (dist/).
// La pagina è un frammento HTML (senza <html>/<head>): va bene sia per l'Artifact
// di claude.ai sia per essere incollata in una pagina esistente.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('artifact', { recursive: true });
copyFileSync('dist/game.js', 'artifact/game.js');
writeFileSync(
  'artifact/index.html',
  `<title>OfficeBonk</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Mono:wght@500;700&family=IBM+Plex+Sans+Condensed:wght@400;600;700&display=swap">
<style>:root{color-scheme:dark}html,body{margin:0;height:100%;background:#10131c;color:#f7f5ef}</style>
<div id="app"></div>
<script src="game.js"></script>
`,
);
console.log('artifact/ pronto');
