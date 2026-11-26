import type {
  ArtPackMode,
  AssetManifest,
  PackDebugSnapshot,
} from '../contracts/index.ts';
import {
  importCustomPackFiles,
  promptFolderPicker,
  tryLoadDevMiddlewarePack,
  tryLoadIndexedDbPack,
  type LoadedCustomPack,
} from './CustomPackLoader.ts';

export class AssetRegistry {
  private readonly builtinCanvas: HTMLCanvasElement;
  private readonly builtinManifest: AssetManifest;
  private customPack: LoadedCustomPack | null = null;
  private activeMode: ArtPackMode = 'builtin';
  private listeners = new Set<() => void>();

  constructor(builtinCanvas: HTMLCanvasElement, builtinManifest: AssetManifest) {
    this.builtinCanvas = builtinCanvas;
    this.builtinManifest = builtinManifest;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  async detectAvailableCustomPack(): Promise<boolean> {
    if (this.customPack) return true;
    const fromIdb = await tryLoadIndexedDbPack(this.builtinCanvas, this.builtinManifest);
    if (fromIdb) {
      this.customPack = fromIdb;
      this.notify();
      return true;
    }
    const fromDev = await tryLoadDevMiddlewarePack(this.builtinCanvas, this.builtinManifest);
    if (fromDev) {
      this.customPack = fromDev;
      this.notify();
      return true;
    }
    return false;
  }

  async loadCustomPackFromPicker(): Promise<boolean> {
    const files = await promptFolderPicker();
    if (!files) return false;
    const loaded = await importCustomPackFiles(files, this.builtinCanvas, this.builtinManifest);
    if (!loaded) return false;
    this.customPack = loaded;
    this.activeMode = 'custom';
    this.notify();
    return true;
  }

  async setActiveMode(mode: ArtPackMode): Promise<boolean> {
    if (mode === 'builtin') {
      this.activeMode = 'builtin';
      this.notify();
      return true;
    }
    if (!this.customPack) {
      await this.detectAvailableCustomPack();
    }
    if (!this.customPack) {
      this.activeMode = 'builtin';
      this.notify();
      return false;
    }
    this.activeMode = 'custom';
    this.notify();
    return true;
  }

  getActiveMode(): ArtPackMode {
    return this.activeMode === 'custom' && this.customPack ? 'custom' : 'builtin';
  }

  getActiveAtlas(): { canvas: HTMLCanvasElement; manifest: AssetManifest } {
    if (this.activeMode === 'custom' && this.customPack) {
      return {
        canvas: this.customPack.atlasCanvas,
        manifest: this.customPack.manifest,
      };
    }
    return {
      canvas: this.builtinCanvas,
      manifest: this.builtinManifest,
    };
  }

  getActiveAudioFetcher(): ((logicalId: string) => Promise<ArrayBuffer | null>) | null {
    if (this.activeMode === 'custom' && this.customPack) {
      return this.customPack.audioFetcher;
    }
    return null;
  }

  getDebugSnapshot(): PackDebugSnapshot {
    const active = this.getActiveAtlas();
    return {
      activePack: this.getActiveMode(),
      customPackAvailable: this.customPack !== null,
      customPackSource: this.customPack ? this.customPack.source : 'none',
      spriteCount: Object.keys(active.manifest.sprites).length,
    };
  }
}
