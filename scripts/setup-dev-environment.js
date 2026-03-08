#!/usr/bin/env node

const net = require('node:net');

const target = process.argv[2];

const DEFAULTS = {
  frontend: 5173,
  backend: 8000
};

if (!DEFAULTS[target]) {
  console.error('Usage: node scripts/setup-dev-environment.js <frontend|backend>');
  process.exit(1);
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function getNextAvailablePort(startPort) {
  let candidate = startPort;
  const maxPort = 65535;

  while (candidate <= maxPort) {
    // Probe one-by-one so we can always choose the first free port.
    // This keeps dev URLs deterministic and easy to reason about.
    if (await isPortOpen(candidate)) {
      return candidate;
    }
    candidate += 1;
  }

  throw new Error(`No available ports found from ${startPort} to ${maxPort}`);
}

getNextAvailablePort(DEFAULTS[target])
  .then((port) => {
    process.stdout.write(String(port));
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
