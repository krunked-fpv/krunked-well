import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
};

function customPackMiddleware(): Plugin {
  const packRoot = path.resolve(process.cwd(), '.krunked-well-assets');
  return {
    name: 'krunked-well-custom-pack-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/custom-pack', (req, res, next) => {
        if (!fs.existsSync(packRoot)) {
          res.statusCode = 404;
          res.end('Custom pack not extracted');
          return;
        }
        const rawUrl = (req.url ?? '/').split('?')[0] ?? '/';
        const decoded = decodeURIComponent(rawUrl).replace(/^\/+/, '');
        const resolved = path.resolve(packRoot, decoded);
        if (!resolved.startsWith(packRoot)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
          next();
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(resolved).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [customPackMiddleware()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
});
