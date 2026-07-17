// File: src/platform/native/__tests__/storage.native.test.ts
// Description: Guards EN-27 P0.4 (the TB-9 "offline audio doesn't appear saved" shape). The native
//   storage adapter returned null/[] for BOTH "absent" and "read error", so corrupt offline
//   audio/user state looked like "nothing saved". These tests mock @capacitor/preferences +
//   @capacitor/filesystem and assert: a corrupt-JSON pref logs NATIVE_STORAGE_PARSE_FAILED; a blob
//   READ error (not a missing file) logs NATIVE_BLOB_READ_FAILED; a genuinely-missing blob (routine
//   cache miss) stays SILENT; a readdir read error logs while a missing dir stays silent.
// Author: EN-27 error-hardening (test build-out)
// Created: 2026-07-17

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), critical: vi.fn() },
}));

const prefsGet = vi.fn();
const fsReadFile = vi.fn();
const fsReaddir = vi.fn();

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: (o: unknown) => prefsGet(o), set: vi.fn(), remove: vi.fn(), keys: vi.fn(async () => ({ keys: [] })), clear: vi.fn() },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: (o: unknown) => fsReadFile(o), readdir: (o: unknown) => fsReaddir(o), writeFile: vi.fn(), deleteFile: vi.fn(), mkdir: vi.fn() },
  Directory: { Data: 'DATA' },
}));

import { createNativeStorageAdapter } from '../storage.native';
import { logger } from '../../../lib/logger';

beforeEach(() => {
  prefsGet.mockReset();
  fsReadFile.mockReset();
  fsReaddir.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('native storage — corrupt vs absent is visible (EN-27 P0.4 / TB-9)', () => {
  it('get(): corrupt JSON logs NATIVE_STORAGE_PARSE_FAILED and returns null', async () => {
    prefsGet.mockResolvedValue({ value: '{not valid json' });
    const adapter = createNativeStorageAdapter();

    const result = await adapter.get('fm:prefs');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'NATIVE_STORAGE_PARSE_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING', details: { key: 'fm:prefs' } }),
    );
  });

  it('get(): a genuinely absent key returns null WITHOUT logging (routine)', async () => {
    prefsGet.mockResolvedValue({ value: null });
    const adapter = createNativeStorageAdapter();

    const result = await adapter.get('fm:missing');

    expect(result).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('getBlob(): a READ error (not "not found") logs NATIVE_BLOB_READ_FAILED and returns null', async () => {
    fsReadFile.mockRejectedValue(new Error('EACCES: permission denied'));
    const adapter = createNativeStorageAdapter();

    const result = await adapter.getBlob('clip-1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'NATIVE_BLOB_READ_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING', details: { key: 'clip-1' } }),
    );
  });

  it('getBlob(): a missing file is a routine cache miss — returns null, NO log', async () => {
    fsReadFile.mockRejectedValue(new Error('File does not exist'));
    const adapter = createNativeStorageAdapter();

    const result = await adapter.getBlob('clip-absent');

    expect(result).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('blobKeys(): a missing dir stays silent; a real read error logs NATIVE_BLOB_LISTDIR_FAILED', async () => {
    const adapter = createNativeStorageAdapter();

    // Missing directory (first run) — routine, silent.
    fsReaddir.mockRejectedValueOnce(new Error('Directory does not exist'));
    await adapter.blobKeys();
    expect(logger.warn).not.toHaveBeenCalled();

    // Real read error — logged.
    fsReaddir.mockRejectedValueOnce(new Error('I/O error'));
    await adapter.blobKeys();
    expect(logger.warn).toHaveBeenCalledWith(
      'NATIVE_BLOB_LISTDIR_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING' }),
    );
  });

  it('blobUsage(): a real readdir error logs NATIVE_BLOB_STAT_FAILED', async () => {
    const adapter = createNativeStorageAdapter();
    fsReaddir.mockRejectedValue(new Error('I/O error'));

    await adapter.blobUsage();

    expect(logger.warn).toHaveBeenCalledWith(
      'NATIVE_BLOB_STAT_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING' }),
    );
  });
});
