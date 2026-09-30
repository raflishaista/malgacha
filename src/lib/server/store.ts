import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Character, Job } from '../types';

export class Store {
  constructor(readonly root: string) {}
  private async write(folder: string, name: string, value: unknown) {
    const directory = join(this.root, folder);
    await mkdir(directory, { recursive: true });
    const target = join(directory, `${name}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), 'utf8');
    // Windows readers / antivirus can briefly hold the destination open.
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, target); break; }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || '') || attempt >= 7) throw error;
        await sleep(20 * (attempt + 1));
      }
    }
  }
  private async read<T>(folder: string, name: string): Promise<T | null> {
    try { return JSON.parse(await readFile(join(this.root, folder, `${name}.json`), 'utf8')) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  saveJob(job: Job) { return this.write('jobs', job.id, job); }
  getJob(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return Promise.resolve(null);
    return this.read<Job>('jobs', id);
  }
  async jobs(): Promise<Job[]> {
    await mkdir(join(this.root, 'jobs'), { recursive: true });
    const files = await readdir(join(this.root, 'jobs'));
    const jobs = await Promise.all(files.filter((file) => file.endsWith('.json')).map((file) => this.getJob(file.slice(0, -5))));
    return jobs.filter((job): job is Job => job !== null);
  }
  async cast(key: string): Promise<Character[] | null> {
    const entry = await this.read<{ fetchedAt: number; data: Character[] }>('casts', key.replace(':', '-'));
    return entry && Date.now() - entry.fetchedAt < 24 * 60 * 60 * 1000 ? entry.data : null;
  }
  saveCast(key: string, data: Character[]) {
    return this.write('casts', key.replace(':', '-'), { fetchedAt: Date.now(), data });
  }
}
