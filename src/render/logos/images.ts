import javaPartsUrl from '../../assets/java-parts.webp?inline';
import joscarUrl from '../../assets/joscar.webp?inline';
import mongoLeafUrl from '../../assets/mongo-leaf.webp?inline';
import nghTextUrl from '../../assets/ngh-text.webp?inline';
import soldoCardUrl from '../../assets/soldo-card.webp?inline';
import springUrl from '../../assets/spring.webp?inline';

// Immagini dei loghi raster (in src/assets), incluse nel bundle come data URL.

const SOURCES: Record<string, string> = {
  java: javaPartsUrl,
  soldo: soldoCardUrl,
  spring: springUrl,
  mongo: mongoLeafUrl,
  ngh: nghTextUrl,
  joscar: joscarUrl,
};

export const images = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`immagine non caricata: ${src.slice(0, 40)}…`));
    im.src = src;
  });
}

/** Va chiamata prima di costruire l'atlas. */
export async function loadLogoImages() {
  await Promise.all(
    Object.entries(SOURCES).map(async ([k, url]) => {
      try {
        images.set(k, await loadImage(url));
      } catch (e) {
        console.warn(e); // lo sprite resterà vuoto, il gioco funziona lo stesso
      }
    }),
  );
}
