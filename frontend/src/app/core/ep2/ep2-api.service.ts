import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { SessionService } from './session.service';
import type { CatalogStatus, Page, PriceHistory, Project, ProjectBudget, ProjectRoom, ProjectSummary, Publication, RoomInput } from './ep2.types';

@Injectable({ providedIn: 'root' })
export class Ep2ApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  catalog(filters: Record<string, string>, page = 1): Promise<Page<Publication>> {
    const params = new HttpParams({ fromObject: { ...filters, page, limit: 12 } });
    return firstValueFrom(this.http.get<Page<Publication>>('/api/materials', { params }));
  }
  status(): Promise<CatalogStatus> { return firstValueFrom(this.http.get<CatalogStatus>('/api/materials/status')); }
  history(key: string, page = 1): Promise<PriceHistory> {
    return firstValueFrom(this.http.get<PriceHistory>(`/api/materials/${encodeURIComponent(key)}/history`, { params: { page, limit: 20 } }));
  }
  projects(): Promise<ProjectSummary[]> { return this.privateRequest(this.http.get<ProjectSummary[]>('/api/projects', { headers: this.session.headers() })); }
  project(id: number): Promise<Project> { return this.privateRequest(this.http.get<Project>(`/api/projects/${id}`, { headers: this.session.headers() })); }
  saveProject(data: { name: string; budgetClp: number }, id?: number): Promise<ProjectSummary> {
    const options = { headers: this.session.headers() };
    return this.privateRequest(id ? this.http.patch<ProjectSummary>(`/api/projects/${id}`, data, options) : this.http.post<ProjectSummary>('/api/projects', data, options));
  }
  deleteProject(id: number): Promise<void> { return this.privateRequest(this.http.delete<void>(`/api/projects/${id}`, { headers: this.session.headers() })); }
  saveRoom(id: number, data: RoomInput | { publicationKey: string | null }, roomId?: string): Promise<ProjectRoom> {
    const url = `/api/projects/${id}/rooms`;
    const options = { headers: this.session.headers() };
    return this.privateRequest(roomId ? this.http.patch<ProjectRoom>(`${url}/${encodeURIComponent(roomId)}`, data, options) : this.http.post<ProjectRoom>(url, data, options));
  }
  deleteRoom(id: number, roomId: string): Promise<void> { return this.privateRequest(this.http.delete<void>(`/api/projects/${id}/rooms/${encodeURIComponent(roomId)}`, { headers: this.session.headers() })); }
  budget(id: number): Promise<ProjectBudget> { return this.privateRequest(this.http.get<ProjectBudget>(`/api/projects/${id}/budget`, { headers: this.session.headers() })); }
  private async privateRequest<T>(request: Observable<T>): Promise<T> {
    try { return await firstValueFrom(request); }
    catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) this.session.clear();
      throw error;
    }
  }
}

export function apiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'La sesión venció o las credenciales no son correctas. Inicia sesión nuevamente.';
    if (error.status === 404) return 'No se encontró el proyecto o no pertenece a esta cuenta.';
    if (error.status === 409) return 'Ya existe una cuenta con ese correo o hubo un conflicto al guardar.';
    if (error.status === 0) return 'No se pudo conectar con la API. Comprueba que los servicios estén iniciados.';
    if (error.status >= 500) return 'El servicio no está disponible. Conservamos la última información; vuelve a consultar.';
    if (error.status === 400) return 'Revisa los datos: nombre, superficie, margen y presupuesto deben ser válidos.';
  }
  return 'No se pudo completar la operación. Inténtalo nuevamente.';
}
export function money(value: number | string | null): string {
  return value === null ? 'Pendiente' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: typeof value === 'string' ? 2 : 0 }).format(Number(value));
}
export function chileDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin comprobación';
  const parts = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}
