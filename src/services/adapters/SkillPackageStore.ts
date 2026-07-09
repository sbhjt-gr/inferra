import { File } from 'expo-file-system';

import { fs } from '../fs';

const PKG_ROOT = 'skills';

const join = (base: string, part: string): string => {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${part}`;
};

const writeText = async (path: string, text: string): Promise<void> => {
  const file = new File(path);
  file.create({ overwrite: true });
  const bytes = new TextEncoder().encode(text);
  file.write(bytes);
};

const writeBytes = async (path: string, bytes: Uint8Array): Promise<void> => {
  const file = new File(path);
  file.create({ overwrite: true });
  file.write(bytes);
};

class SkillPackageStore {
  skillsRoot(): string {
    return join(fs.documentDirectory, PKG_ROOT);
  }

  pkgPath(id: string): string {
    return join(this.skillsRoot(), id);
  }

  scriptPath(id: string, scriptName: string): string {
    return join(join(this.pkgPath(id), 'scripts'), scriptName);
  }

  cachePath(id: string, scriptName: string): string {
    return join(join(join(this.pkgPath(id), 'cache'), 'scripts'), scriptName);
  }

  async ensureRoot(): Promise<void> {
    await fs.makeDirectoryAsync(this.skillsRoot(), { intermediates: true });
  }

  async writePackage(id: string, files: Record<string, string | Uint8Array>): Promise<string> {
    await this.ensureRoot();
    const root = this.pkgPath(id);
    await fs.deleteAsync(root, { idempotent: true });
    await fs.makeDirectoryAsync(root, { intermediates: true });

    for (const [rel, content] of Object.entries(files)) {
      const path = join(root, rel);
      const dir = path.slice(0, path.lastIndexOf('/'));
      if (dir.length > root.length) {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      }
      if (typeof content === 'string') {
        await writeText(path, content);
      } else {
        await writeBytes(path, content);
      }
    }

    console.log('pkg_write', id, Object.keys(files).length);
    return root;
  }

  async readScript(id: string, scriptName: string, useCache = false): Promise<string | null> {
    const path = useCache ? this.cachePath(id, scriptName) : this.scriptPath(id, scriptName);
    const info = await fs.getInfoAsync(path);
    if (!info.exists || info.isDirectory) {
      console.log('pkg_miss', id, scriptName);
      return null;
    }
    const text = await fs.readAsStringAsync(path);
    console.log('pkg_read', id, scriptName);
    return text;
  }

  scriptUri(id: string, scriptName: string, useCache = false): string {
    return useCache ? this.cachePath(id, scriptName) : this.scriptPath(id, scriptName);
  }

  async cacheRemoteScript(id: string, scriptName: string, html: string): Promise<string> {
    const path = this.cachePath(id, scriptName);
    const dir = path.slice(0, path.lastIndexOf('/'));
    await fs.makeDirectoryAsync(dir, { intermediates: true });
    await writeText(path, html);
    console.log('pkg_cache', id, scriptName);
    return path;
  }

  async removePackage(id: string): Promise<void> {
    await fs.deleteAsync(this.pkgPath(id), { idempotent: true });
    console.log('pkg_remove', id);
  }

  async listScripts(id: string): Promise<string[]> {
    const dir = join(this.pkgPath(id), 'scripts');
    const info = await fs.getInfoAsync(dir);
    if (!info.exists || !info.isDirectory) {
      return [];
    }
    const names = await fs.readDirectoryAsync(dir);
    return names.filter(name => name.endsWith('.html'));
  }
}

export const skillPkgStore = new SkillPackageStore();
