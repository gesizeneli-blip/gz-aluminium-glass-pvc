import { panelUrl } from '../data/panels';

/** Door panel pictures as JPEG data URLs, preloaded so the (synchronous) PDF builder can embed them. */
const cache = new Map<string, string>();

export const getPanelData = (file: string) => cache.get(file);

export async function preloadPanelImages(files: string[]): Promise<void> {
  const todo = [...new Set(files)].filter((f) => f && !cache.has(f));
  await Promise.all(
    todo.map(
      (f) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              const g = c.getContext('2d')!;
              g.fillStyle = '#ffffff';
              g.fillRect(0, 0, c.width, c.height);
              g.drawImage(img, 0, 0);
              cache.set(f, c.toDataURL('image/jpeg', 0.88));
            } catch { /* ignore: picture is optional in the PDF */ }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = panelUrl(f);
        })
    )
  );
}
