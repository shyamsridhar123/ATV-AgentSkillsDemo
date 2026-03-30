/**
 * CLI command: ado-sync start|stop|status (BETH-64.13)
 *
 * Thin wrapper that parses the subcommand and delegates to adoSyncProcess.
 */

import { startWatcher, stopWatcher, getWatcherStatus } from '../lib/adoSyncProcess.js';

/**
 * Execute the ado-sync subcommand.
 * @param subcommand - 'start', 'stop', or 'status'
 */
export async function adoSync(subcommand: string): Promise<void> {
  const cwd = process.cwd();

  try {
    switch (subcommand) {
      case 'start': {
        const result = await startWatcher(cwd);
        if (result.alreadyRunning) {
          console.log(`ADO Sync watcher is already running (PID ${result.pid}).`);
          return;
        }
        if (result.started) {
          console.log(`ADO Sync watcher started (PID ${result.pid}).`);
        }
        break;
      }

      case 'stop': {
        const result = await stopWatcher(cwd);
        if (!result.wasRunning) {
          if (result.stalePidCleaned) {
            console.log('ADO Sync watcher was not running (cleaned stale PID file).');
          } else {
            console.log('ADO Sync watcher is not running.');
          }
          return;
        }
        if (result.stopped) {
          console.log(`ADO Sync watcher stopped (was PID ${result.pid}).`);
        }
        break;
      }

      case 'status': {
        const status = await getWatcherStatus(cwd);
        console.log(`State:    ${status.state}`);
        if (status.pid) {
          console.log(`PID:      ${status.pid}`);
        }
        if (status.organization) {
          console.log(`Org:      ${status.organization}`);
          console.log(`Project:  ${status.project ?? '(none)'}`);
          console.log(`Auth:     ${status.authMethod ?? 'unknown'}`);
        } else {
          console.log('Config:   not configured');
        }
        break;
      }

      default:
        console.error(`Unknown ado-sync subcommand: "${subcommand}"`);
        console.error('Usage: npx beth-copilot ado-sync <start|stop|status>');
        process.exitCode = 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ado-sync ${subcommand} failed: ${message}`);
    process.exitCode = 1;
  }
}
