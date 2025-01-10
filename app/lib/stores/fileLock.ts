import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileLock');

export interface FileLock {
  ownerId: string;
  timestamp: number;
  filePath: string;
}

interface FileLockStore {
  [filePath: string]: FileLock | undefined;
}

// 5 minutes timeout for locks
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Store for tracking file locks across the application
 */
export const fileLocks: MapStore<FileLockStore> = map({});

/**
 * Event emitter for lock events
 */
export const lockEvents = {
  acquired: atom<FileLock | null>(null),
  released: atom<FileLock | null>(null),
  denied: atom<{ filePath: string; currentOwner: FileLock | null } | null>(null),
};

/**
 * Attempts to acquire a lock on a file
 * @param filePath - The path of the file to lock
 * @param ownerId - Unique identifier for the lock owner (e.g., session ID)
 * @returns boolean indicating if lock was acquired
 */
export function acquireLock(filePath: string, ownerId: string): boolean {
  const currentLock = fileLocks.get()[filePath];

  // Check if file is already locked
  if (currentLock) {
    // Check if lock has expired
    if (Date.now() - currentLock.timestamp > LOCK_TIMEOUT_MS) {
      logger.debug(`Lock expired for ${filePath}, releasing`);
      releaseLock(filePath, currentLock.ownerId);
    } else {
      logger.debug(`Lock denied for ${filePath}, already locked by ${currentLock.ownerId}`);
      lockEvents.denied.set({ filePath, currentOwner: currentLock });

      return false;
    }
  }

  // Create new lock
  const lock: FileLock = {
    ownerId,
    timestamp: Date.now(),
    filePath,
  };

  fileLocks.setKey(filePath, lock);
  lockEvents.acquired.set(lock);
  logger.debug(`Lock acquired for ${filePath} by ${ownerId}`);

  return true;
}

/**
 * Releases a lock on a file
 * @param filePath - The path of the file to unlock
 * @param ownerId - Unique identifier for the lock owner
 * @returns boolean indicating if lock was released
 */
export function releaseLock(filePath: string, ownerId: string): boolean {
  const currentLock = fileLocks.get()[filePath];

  if (!currentLock) {
    logger.debug(`No lock found for ${filePath}`);
    return false;
  }

  if (currentLock.ownerId !== ownerId) {
    logger.debug(`Lock release denied for ${filePath}, wrong owner`);
    return false;
  }

  fileLocks.setKey(filePath, undefined);
  lockEvents.released.set(currentLock);
  logger.debug(`Lock released for ${filePath} by ${ownerId}`);

  return true;
}

/**
 * Checks if a file is currently locked
 * @param filePath - The path of the file to check
 * @returns The current lock if file is locked, null otherwise
 */
export function getLock(filePath: string): FileLock | null {
  const lock = fileLocks.get()[filePath];

  if (!lock) {
    return null;
  }

  // Check if lock has expired
  if (Date.now() - lock.timestamp > LOCK_TIMEOUT_MS) {
    logger.debug(`Lock expired for ${filePath}, releasing`);
    releaseLock(filePath, lock.ownerId);

    return null;
  }

  return lock;
}

/**
 * Checks if a file is currently locked
 * @param filePath - The path of the file to check
 * @returns boolean indicating if file is locked
 */
export function isLocked(filePath: string): boolean {
  return getLock(filePath) !== null;
}

/**
 * Refreshes a lock's timestamp
 * @param filePath - The path of the file
 * @param ownerId - Unique identifier for the lock owner
 * @returns boolean indicating if lock was refreshed
 */
export function refreshLock(filePath: string, ownerId: string): boolean {
  const currentLock = fileLocks.get()[filePath];

  if (!currentLock || currentLock.ownerId !== ownerId) {
    return false;
  }

  const lock: FileLock = {
    ...currentLock,
    timestamp: Date.now(),
  };

  fileLocks.setKey(filePath, lock);
  logger.debug(`Lock refreshed for ${filePath} by ${ownerId}`);

  return true;
}
