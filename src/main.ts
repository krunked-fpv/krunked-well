import { GameApp } from './app/GameApp.ts';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Krunked Well: #app root element not found.');
  }
  const app = new GameApp(root);
  app.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
