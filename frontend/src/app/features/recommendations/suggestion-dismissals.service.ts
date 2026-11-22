import { Injectable, effect, inject } from '@angular/core';
import { SessionService } from '../../core/ep2/session.service';

@Injectable({ providedIn: 'root' })
export class SuggestionDismissals {
  private readonly session = inject(SessionService);
  private readonly rooms = new Map<string, Set<string>>();
  private userId: number | null = null;

  constructor() {
    effect(() => {
      const userId = this.session.user()?.id ?? null;
      if (userId !== this.userId) {
        this.userId = userId;
        this.rooms.clear();
      }
    });
  }

  keys(projectId: number, roomId: string): string[] {
    return [...(this.rooms.get(`${projectId}/${roomId}`) ?? [])];
  }

  dismiss(projectId: number, roomId: string, publicationKey: string): void {
    const roomKey = `${projectId}/${roomId}`;
    const keys = this.rooms.get(roomKey) ?? new Set<string>();
    keys.add(publicationKey);
    this.rooms.set(roomKey, keys);
  }
}
