/**
 * pm2 ecosystem for the auto-invoice backend (Hono + tsx, no build step).
 *
 * Unlike jemput-api (compiled dist/), this backend runs TypeScript directly via
 * `node --import tsx`. Single fork instance per env: it's a stateless API and
 * tsx's on-the-fly transpile doesn't cluster cleanly.
 *
 * APP_ENV picks the env file (src/load-env.ts):
 *   prod (default for NODE_ENV=production) → backend/.env.prod  (port 4001)
 *   stg                                   → backend/.env.stg    (port 4002)
 * NODE_ENV stays 'production' for both so code runs identically; only the
 * LHDN target + PORT + encryption key differ. Secrets/PORT come from the
 * selected .env file, so the ecosystem env block only sets the selector.
 *
 * Persistence: `pm2 save` after start + `pm2 startup` (already registered on
 * this box as pm2-ubuntu.service) resurrects these processes across reboots.
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
    {
      // Staging backend → LHDN sandbox (preprod-api.myinvois.hasil.gov.my).
      // Runs on port 4002 alongside the prod backend (4001). No mock: real
      // token/validate/submit calls against the LHDN sandbox. Use to exercise
      // the intermediary (Step B) flow before going live.
      name: 'auto-invoice-api-stg',
      cwd: '/home/ubuntu/neyobytes-auto-invoice/backend',
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'stg',
      },
      watch: false,
      max_memory_restart: '256M',
      kill_timeout: 5000,
      listen_timeout: 10000,
      error_file: '/home/ubuntu/.pm2/logs/auto-invoice-api-stg-error.log',
      out_file: '/home/ubuntu/.pm2/logs/auto-invoice-api-stg-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
    },
  ],
}