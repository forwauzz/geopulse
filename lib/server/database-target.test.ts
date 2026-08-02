import { describe, expect, it } from 'vitest';
import { resolveDatabaseTarget } from './database-target';

describe('local database detection', () => {
  it('recognises loopback and the Docker host alias', () => {
    for (const url of [
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://LOCALHOST:54321',
      'http://host.docker.internal:54321',
      'http://[::1]:54321',
    ]) {
      expect(resolveDatabaseTarget(url).isLocal).toBe(true);
    }
  });

  it('treats every hosted project as remote', () => {
    for (const url of ['https://vynrlgtxqnomxenakafn.supabase.co', 'https://db.example.com']) {
      expect(resolveDatabaseTarget(url).isLocal).toBe(false);
    }
  });

  it('is not fooled by a hostname that merely contains "localhost"', () => {
    // A substring or suffix check would wave through exactly the case the guard exists to catch.
    for (const url of [
      'https://localhost.attacker.com',
      'https://my-localhost-db.supabase.co',
      'https://127.0.0.1.attacker.com',
    ]) {
      expect(resolveDatabaseTarget(url).isLocal).toBe(false);
    }
  });

  it('treats an unparseable URL as remote, not as safe', () => {
    expect(resolveDatabaseTarget('not a url')).toEqual({ host: 'unparseable', isLocal: false });
    expect(resolveDatabaseTarget('')).toEqual({ host: 'unparseable', isLocal: false });
  });

  it('reports the host for the operator-facing confirmation line', () => {
    expect(resolveDatabaseTarget('http://127.0.0.1:54321').host).toBe('127.0.0.1:54321');
    expect(resolveDatabaseTarget('https://vynrlgtxqnomxenakafn.supabase.co').host).toBe('vynrlgtxqnomxenakafn.supabase.co');
  });
});
