/**
 * The web-port check `pnpm dev` runs before compose starts (story 1.1, I/O matrix row "Busy port").
 */
import { createConnection } from 'node:net';
/** Whether something accepts TCP connections on `127.0.0.1:port`. */
export function portInUse(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host });
        socket.setTimeout(400);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => resolve(false));
    });
}
