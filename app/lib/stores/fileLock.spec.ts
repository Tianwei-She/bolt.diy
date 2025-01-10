import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { acquireLock, releaseLock, refreshLock, getLock, isLocked, fileLocks } from './fileLock';

describe('FileLock', () => {
  const TEST_FILE = '/test/file.txt';
  const TEST_OWNER = 'test-owner-123';
  const OTHER_OWNER = 'other-owner-456';

  beforeEach(() => {
    // Reset the fileLocks store before each test
    fileLocks.set({});

    // Reset system time
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore system time
    vi.useRealTimers();
  });

  describe('acquireLock', () => {
    it('should acquire lock for a file', () => {
      const success = acquireLock(TEST_FILE, TEST_OWNER);
      expect(success).toBe(true);

      const lock = fileLocks.get()[TEST_FILE];
      expect(lock).toBeDefined();
      expect(lock?.ownerId).toBe(TEST_OWNER);
      expect(lock?.filePath).toBe(TEST_FILE);
      expect(typeof lock?.timestamp).toBe('number');
    });

    it('should prevent multiple locks on same file', () => {
      // First lock succeeds
      expect(acquireLock(TEST_FILE, TEST_OWNER)).toBe(true);

      // Second lock fails
      expect(acquireLock(TEST_FILE, OTHER_OWNER)).toBe(false);

      // Original lock remains
      const lock = fileLocks.get()[TEST_FILE];
      expect(lock?.ownerId).toBe(TEST_OWNER);
    });

    it('should allow lock after timeout', () => {
      // Acquire initial lock
      expect(acquireLock(TEST_FILE, TEST_OWNER)).toBe(true);

      // Advance time past 5-minute timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // New lock should succeed
      expect(acquireLock(TEST_FILE, OTHER_OWNER)).toBe(true);

      // Verify new owner
      const lock = fileLocks.get()[TEST_FILE];
      expect(lock?.ownerId).toBe(OTHER_OWNER);
    });
  });

  describe('releaseLock', () => {
    it('should release an existing lock', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      const success = releaseLock(TEST_FILE, TEST_OWNER);
      expect(success).toBe(true);
      expect(fileLocks.get()[TEST_FILE]).toBeUndefined();
    });

    it('should fail to release if wrong owner', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      const success = releaseLock(TEST_FILE, OTHER_OWNER);
      expect(success).toBe(false);

      // Lock should still exist
      expect(fileLocks.get()[TEST_FILE]).toBeDefined();
    });

    it('should fail to release non-existent lock', () => {
      const success = releaseLock(TEST_FILE, TEST_OWNER);
      expect(success).toBe(false);
    });
  });

  describe('refreshLock', () => {
    it('should refresh lock timestamp', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      const originalLock = fileLocks.get()[TEST_FILE];

      // Advance time a bit
      vi.advanceTimersByTime(60 * 1000); // 1 minute

      const success = refreshLock(TEST_FILE, TEST_OWNER);
      expect(success).toBe(true);

      const refreshedLock = fileLocks.get()[TEST_FILE];
      expect(refreshedLock?.timestamp).toBeGreaterThan(originalLock!.timestamp);
    });

    it('should fail to refresh if wrong owner', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      const originalLock = fileLocks.get()[TEST_FILE];

      const success = refreshLock(TEST_FILE, OTHER_OWNER);
      expect(success).toBe(false);

      // Timestamp should not change
      const currentLock = fileLocks.get()[TEST_FILE];
      expect(currentLock?.timestamp).toBe(originalLock?.timestamp);
    });
  });

  describe('getLock', () => {
    it('should return null for non-existent lock', () => {
      expect(getLock(TEST_FILE)).toBeNull();
    });

    it('should return lock info for existing lock', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      const lock = getLock(TEST_FILE);
      expect(lock).toBeDefined();
      expect(lock?.ownerId).toBe(TEST_OWNER);
      expect(lock?.filePath).toBe(TEST_FILE);
    });

    it('should return null for expired lock', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      // Advance time past timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      expect(getLock(TEST_FILE)).toBeNull();
    });
  });

  describe('isLocked', () => {
    it('should return true for locked file', () => {
      acquireLock(TEST_FILE, TEST_OWNER);
      expect(isLocked(TEST_FILE)).toBe(true);
    });

    it('should return false for unlocked file', () => {
      expect(isLocked(TEST_FILE)).toBe(false);
    });

    it('should return false for expired lock', () => {
      acquireLock(TEST_FILE, TEST_OWNER);

      // Advance time past timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      expect(isLocked(TEST_FILE)).toBe(false);
    });
  });
});
