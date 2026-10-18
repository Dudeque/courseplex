import { get, set } from 'idb-keyval';

interface DurationTask {
  relativePath: string;
  file: File;
  onResolved: (durationSeconds: number) => void;
}

class DurationHydratorQueue {
  private queue: DurationTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrency = 3;

  private getCacheKey(relativePath: string, file: File): string {
    return `courseplex_dur_${relativePath}_${file.lastModified}_${file.size}`;
  }

  public async getCachedDuration(relativePath: string, file: File): Promise<number | null> {
    try {
      const key = this.getCacheKey(relativePath, file);
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

    this.extractVideoDuration(task.file)
      .then(async (duration) => {
        if (duration > 0) {
          try {
            await set(this.getCacheKey(task.relativePath, task.file), duration);
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

  private extractVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(0);
        return;
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        URL.revokeObjectURL(objectUrl);
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
