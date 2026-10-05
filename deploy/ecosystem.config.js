// PM2 — 2 process của VPS Tôi Đặt Món. Cả hai đọc chung vps-worker/.env.
const path = require('path');
const WORKER = path.join(__dirname, '..', 'vps-worker');

module.exports = {
  apps: [
    {
      name: 'toidatmon-vps',
      cwd: WORKER,
      script: 'src/index.js',
      node_args: '-r dotenv/config',
      env: { NODE_ENV: 'production', DOTENV_CONFIG_PATH: path.join(WORKER, '.env') },
      max_memory_restart: '1G',
      time: true,
    },
    {
      name: 'toidatmon-bkav-proxy',
      cwd: path.join(WORKER, 'bkav-proxy'),
      script: 'server.js',
      node_args: '-r ' + path.join(WORKER, 'node_modules', 'dotenv', 'config'),
      env: { NODE_ENV: 'production', DOTENV_CONFIG_PATH: path.join(WORKER, '.env') },
      max_memory_restart: '300M',
      time: true,
    },
  ],
};
