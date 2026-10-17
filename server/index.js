import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.DATABASE_PATH ?? resolve(root, 'data', 'accounts.sqlite');
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });

const { app, close } = createApp({ databasePath });
const server = createServer(app);
let vite;

if (process.env.NODE_ENV === 'production') {
  const { default: express } = await import('express');
  const expressApp = app;
  expressApp.use(express.static(resolve(root, 'dist')));
  expressApp.get(/.*/, (_request, response) => response.sendFile(resolve(root, 'dist', 'index.html')));
} else {
  app.get('/download/project', (_request, response, next) => {
    response.download(resolve(root, 'ascend-capital-project.zip'), 'ascend-capital-project.zip', (error) => {
      if (error && !response.headersSent) next(error);
    });
  });
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => {
  console.log(`Ascend Capital ${process.env.NODE_ENV === 'production' ? 'server' : 'development server'} listening on ${host}:${port}`);
});

async function shutdown() {
  server.close();
  await vite?.close();
  close();
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
