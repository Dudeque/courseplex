import { get, set } from 'idb-keyval';

interface DurationTask {
  relativePath: string;
  source?: File | string;
  file?: File;
  onResolved: (durationSeconds: number) => void;
}

class DurationHydratorQueue {
  private queue: DurationTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrency = 3;

  private getCacheKey(relativePath: string, source: File | string): string {
    if (typeof source === 'string') {
      return `courseplex_dur_${relativePath}`;
    }
    return `courseplex_dur_${relativePath}_${source.lastModified}_${source.size}`;
  }

  public async getCachedDuration(relativePath: string, source: File | string): Promise<number | null> {
    try {
      const key = this.getCacheKey(relativePath, source);
      const cached = await get<number>(key);
      if (typeof cached === 'number' && !isNaN(cached) && cached > 0) {
        return cached;
      }
    } catch (e) {
      console.warn('Error reading duration cache:', e);
    }
    return null;
  }

  public enqueue(task: DurationTask): void {
    this.queue.push(task);
    this.processNext();
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    const src = task.source || task.file;
    if (!src) {
      this.activeCount--;
      this.processNext();
      return;
    }

    this.extractVideoDuration(src)
      .then(async (duration) => {
        if (duration > 0) {
          try {
            await set(this.getCacheKey(task.relativePath, src), duration);
          } catch (err) {
            console.warn('Could not cache duration to IDB:', err);
          }
          task.onResolved(duration);
        }
      })
      .catch((err) => {
        console.warn(`Could not extract duration for ${task.relativePath}:`, err);
      })
      .finally(() => {
        this.activeCount--;
        this.processNext();
      });
  }

  private extractVideoDuration(source: File | string): Promise<number> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(0);
        return;
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const isUrl = typeof source === 'string';
      const videoSrc = isUrl ? source : URL.createObjectURL(source);
      video.src = videoSrc;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        if (!isUrl) {
          URL.revokeObjectURL(videoSrc);
        }
        video.remove();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(0);
      }, 8000); // 8 second timeout per file to prevent hanging

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const duration = Math.round(video.duration || 0);
        cleanup();
        resolve(duration);
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(0);
      };
    });
  }
}

export const durationHydrator = new DurationHydratorQueue();
