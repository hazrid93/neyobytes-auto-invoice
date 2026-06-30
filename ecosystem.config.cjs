/**
 * pm2 ecosystem for the auto-invoice backend (Hono + tsx, no build step).
 *
 * Unlike jemput-api (compiled dist/), this backend runs TypeScript directly via
 * `node --import tsx`. Single fork instance: it's a stateless API and tsx's
 * on-the-fly transpile doesn't cluster cleanly. Secrets/PORT/NODE_ENV all come
 * from backend/.env.prod, loaded by src/load-env.ts when NODE_ENV=production —
 * so the ecosystem env block only needs to set NODE_ENV to switch the loader.
 *
 * Persistence: `pm2 save` after start + `pm2 startup` (already registered on
 * this box as pm2-ubuntu.service) resurrects this process across reboots.
 */
module.exports = {
  apps: [
    {
      name: 'auto-invoice-api',
      cwd: '/home/ubuntu/neyobytes-auto-invoice/backend',
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '256M',
      kill_timeout: 5000,
      listen_timeout: 10000,
      error_file: '/home/ubuntu/.pm2/logs/auto-invoice-api-error.log',
      out_file: '/home/ubuntu/.pm2/logs/auto-invoice-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
    },
  ],
}