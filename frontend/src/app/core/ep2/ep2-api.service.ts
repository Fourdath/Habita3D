import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CatalogStatus, FloorPreferences, FloorSuggestions, Page, PriceHistory, Project, ProjectBudget, ProjectRoom, ProjectSummary, Publication, RoomInput, SuggestionAcceptance } from './ep2.types';
import type { FloorplanRoomInput, ProjectFloorplan } from './ep2.types';

@Injectable({ providedIn: 'root' })
export class Ep2ApiService {
  private readonly http = inject(HttpClient);
  catalog(filters: Record<string, string>, page = 1): Promise<Page<Publication>> {
    const params = new HttpParams({ fromObject: { ...filters, page, limit: 12 } });
    return firstValueFrom(this.http.get<Page<Publication>>('/api/materials', { params }));
  }
  status(): Promise<CatalogStatus> { return firstValueFrom(this.http.get<CatalogStatus>('/api/materials/status')); }
  history(key: string, page = 1): Promise<PriceHistory> {
    return firstValueFrom(this.http.get<PriceHistory>(`/api/materials/${encodeURIComponent(key)}/history`, { params: { page, limit: 20 } }));
  }
  projects(): Promise<ProjectSummary[]> { return firstValueFrom(this.http.get<ProjectSummary[]>('/api/projects')); }
  project(id: number): Promise<Project> { return firstValueFrom(this.http.get<Project>(`/api/projects/${id}`)); }
  saveProject(data: { name: string; budgetClp: number }, id?: number): Promise<ProjectSummary> {
    return firstValueFrom(id ? this.http.patch<ProjectSummary>(`/api/projects/${id}`, data) : this.http.post<ProjectSummary>('/api/projects', data));
  }
  deleteProject(id: number): Promise<void> { return firstValueFrom(this.http.delete<void>(`/api/projects/${id}`)); }
  saveRoom(id: number, data: RoomInput | { publicationKey: string | null }, roomId?: string): Promise<ProjectRoom> {
    const url = `/api/projects/${id}/rooms`;
    return firstValueFrom(roomId ? this.http.patch<ProjectRoom>(this.roomUrl(id, roomId), data) : this.http.post<ProjectRoom>(url, data));
  }
  deleteRoom(id: number, roomId: string): Promise<void> { return firstValueFrom(this.http.delete<void>(this.roomUrl(id, roomId))); }
  budget(id: number): Promise<ProjectBudget> { return firstValueFrom(this.http.get<ProjectBudget>(`/api/projects/${id}/budget`)); }

  async saveProjectFloorplan(id: number, name: string, svg: string, rooms: FloorplanRoomInput[]): Promise<ProjectFloorplan> {
    const { floorplan } = await firstValueFrom(this.http.put<{ floorplan: ProjectFloorplan }>(`/api/projects/${id}/floorplan`, { name, svg, rooms }));
    return floorplan;
  }

  saveProjectFloor(id: number, publicationKey: string, rooms: FloorplanRoomInput[], floorplanRevision?: string): Promise<Project> {
    return firstValueFrom(this.http.patch<Project>(`/api/projects/${id}/floors`, { publicationKey, rooms, floorplanRevision }));
  }

  suggestions(id: number, roomId: string, exclude: string[]): Promise<FloorSuggestions> {
    const params = new HttpParams({ fromObject: { exclude } });
    return firstValueFrom(this.http.get<FloorSuggestions>(`${this.roomUrl(id, roomId)}/suggestions`, { params }));
  }

  saveFloorPreferences(id: number, roomId: string, preferences: FloorPreferences): Promise<ProjectRoom> {
    return firstValueFrom(this.http.patch<ProjectRoom>(`${this.roomUrl(id, roomId)}/suggestions/preferences`, preferences));
  }

  saveSuggestionsEnabled(id: number, suggestionsEnabled: boolean): Promise<{ suggestionsEnabled: boolean }> {
    return firstValueFrom(this.http.patch<{ suggestionsEnabled: boolean }>(`/api/projects/${id}/suggestions/settings`, { suggestionsEnabled }));
  }

  async acceptSuggestion(id: number, roomId: string, publicationKey: string, quoteId: string): Promise<SuggestionAcceptance> {
    try {
      return await firstValueFrom(this.http.post<Extract<SuggestionAcceptance, { status: 'accepted' }>>(
        `${this.roomUrl(id, roomId)}/suggestions/accept`, { publicationKey, quoteId },
      ));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409 && error.error?.status === 'price_changed'
        && error.error.quote?.publicationKey === publicationKey && typeof error.error.quote.quoteId === 'string'
        && Number.isSafeInteger(error.error.quote.totalClp) && Number.isSafeInteger(error.error.quote.boxes)) {
        return { status: 'price_changed', quote: error.error.quote };
      }
      throw error;
    }
  }

  private roomUrl(id: number, roomId: string): string {
    return `/api/projects/${id}/rooms/${encodeURIComponent(roomId)}`;
  }
}

export function apiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'La sesión venció o las credenciales no son correctas. Inicia sesión nuevamente.';
    if (error.status === 403) return 'Esta cuenta no tiene acceso a la operación.';
    if (error.status === 404) return 'No se encontró el proyecto o no pertenece a esta cuenta.';
    if (error.status === 409 && error.error?.code === 'floorplan_changed') return 'El plano cambió. Abre el proyecto nuevamente.';
    if (error.status === 409) return 'Ya existe una cuenta con ese correo o hubo un conflicto al guardar.';
    if (error.status === 0) return 'No se pudo conectar con la aplicación. Comprueba tu conexión y vuelve a intentar.';
    if (error.status === 429) return 'Se alcanzó el límite de solicitudes. Espera un momento y vuelve a intentar.';
    if (error.status >= 500) return 'El servicio no está disponible. Conservamos la última información; vuelve a consultar.';
    if (error.status === 400) return 'Revisa los datos: nombre, superficie, margen y presupuesto deben ser válidos.';
  }
  return 'No se pudo completar la operación. Inténtalo nuevamente.';
}
export function money(value: number | string | null): string {
  return value === null ? 'Pendiente' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: typeof value === 'string' ? 2 : 0 }).format(Number(value));
}
export function safeCatalogUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
export function chileDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin comprobación';
  const parts = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}
