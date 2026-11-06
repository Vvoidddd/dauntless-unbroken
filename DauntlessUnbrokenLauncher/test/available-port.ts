import net from 'node:net';
// Test-only ports selected by the OS avoid Windows runner exclusion ranges.
export async function availablePort(): Promise<number> {
  const server=net.createServer();
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=(server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  return port;
}
