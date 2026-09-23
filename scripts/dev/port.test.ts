import { createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
import { portInUse } from './port';

/** I/O matrix row "Busy port": the check `pnpm dev` runs before compose starts. */

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected a TCP address'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe('portInUse', () => {
  it('is true while something listens on the port, and false once it has closed', async () => {
    const server = createServer((socket) => socket.destroy());
    const port = await listen(server);

    expect(await portInUse(port)).toBe(true);

    await close(server);
    expect(await portInUse(port)).toBe(false);
  });
});
