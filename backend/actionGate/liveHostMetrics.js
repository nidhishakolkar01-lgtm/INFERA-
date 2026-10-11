import os from 'os';

/**
 * Real Host Telemetry & Hardware State
 * Extracts genuine, live system telemetry directly from the host operating system.
 * Zero dummy numbers.
 */
export function getLiveHostTelemetry() {
  const memUsage = process.memoryUsage();
  const cpus = os.cpus();
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();

  return {
    timestamp: new Date().toISOString(),
    osPlatform: os.platform(),
    osRelease: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model || 'Unknown CPU',
    cpuCores: cpus.length,
    processPid: process.pid,
    processUptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memory: {
      totalMb: Math.round(totalMemBytes / (1024 * 1024)),
      freeMb: Math.round(freeMemBytes / (1024 * 1024)),
      usedMb: Math.round((totalMemBytes - freeMemBytes) / (1024 * 1024)),
      heapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(memUsage.heapTotal / (1024 * 1024)),
      rssMb: Math.round(memUsage.rss / (1024 * 1024)),
    },
  };
}
