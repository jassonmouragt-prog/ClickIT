import type { Photo } from '../types/domain.ts';
export function diagnostic(event: string, details: Record<string, string | number>): void {
  window.clickit.diagnostic(event, details);
}
export function previewEvent(event: 'PREVIEW_RENDERED' | 'PREVIEW_FAILED', photo: Photo, image: HTMLImageElement): void {
  diagnostic(event, { id: photo.id, sourcePath: photo.originalPath, previewPath: photo.previewPath ?? '', thumbnailPath: photo.thumbnailPath ?? '', url: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight, error: event === 'PREVIEW_FAILED' ? 'HTMLImageElement não carregou o asset; consulte ASSET_FAILED no processo principal.' : '' });
}
export function installDiagnostics(): void {
  window.addEventListener('error', event => diagnostic('WINDOW_ERROR', { error: event.error instanceof Error ? event.error.stack ?? event.message : event.message, filename: event.filename, line: event.lineno, column: event.colno }));
  window.addEventListener('unhandledrejection', event => diagnostic('UNHANDLED_REJECTION', { error: event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason) }));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    original(...args);
    diagnostic('CONSOLE_ERROR', { error: args.map(arg => arg instanceof Error ? arg.stack ?? arg.message : String(arg)).join(' ') });
  };
}
