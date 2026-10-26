import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface User { id: number; email: string }
interface Session { accessToken: string; expiresAt: string; user: User }
const SESSION_KEY = 'habita3d.ep2.session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly token = signal<string | null>(this.storedToken());
  readonly user = signal<User | null>(null);

  headers(): HttpHeaders {
    const token = this.token();
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  async restore(): Promise<void> {
    if (!this.token()) return;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>('/api/auth/me', { headers: this.headers() })));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) this.clear();
      else throw error;
    }
  }

  async authenticate(mode: 'login' | 'register', email: string, password: string): Promise<void> {
    const session = await firstValueFrom(this.http.post<Session>(`/api/auth/${mode}`, { email: email.trim().toLowerCase(), password }));
    this.token.set(session.accessToken);
    this.user.set(session.user);
    // Tab-local storage survives reloads; no password or operator credential is stored.
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: session.accessToken, expiresAt: session.expiresAt })); } catch { /* Memory-only session remains usable. */ }
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post('/api/auth/logout', {}, { headers: this.headers() })); }
    finally { this.clear(); }
  }

  clear(): void {
    this.token.set(null);
    this.user.set(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be disabled. */ }
  }

  private storedToken(): string | null {
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { accessToken?: unknown; expiresAt?: unknown } | null;
      return data && typeof data.accessToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(data.accessToken)
        && typeof data.expiresAt === 'string' && Date.parse(data.expiresAt) > Date.now() ? data.accessToken : null;
    } catch { return null; }
  }
}
