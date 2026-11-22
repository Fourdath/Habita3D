import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface User { id: number; email: string }
interface Session { accessToken: string; expiresAt: string; user: User }
type StoredSession = Pick<Session, 'accessToken' | 'expiresAt'>;
const SESSION_KEY = 'habita3d.ep2.session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly credentials = signal<StoredSession | null>(this.storedSession());
  private readonly sessionExpired = signal(false);
  readonly user = signal<User | null>(null);
  readonly expired = this.sessionExpired.asReadonly();

  hasSession(): boolean {
    const credentials = this.credentials();
    if (credentials && Date.parse(credentials.expiresAt) <= Date.now()) {
      this.expire(`Bearer ${credentials.accessToken}`);
    }
    return this.credentials() !== null;
  }

  headers(): HttpHeaders {
    this.hasSession();
    const credentials = this.credentials();
    return new HttpHeaders(credentials ? { Authorization: `Bearer ${credentials.accessToken}` } : {});
  }

  async restore(): Promise<void> {
    if (!this.hasSession()) return;
    const credentials = this.credentials();
    try {
      const user = await firstValueFrom(this.http.get<User>('/api/auth/me', { timeout: 8000 }));
      if (credentials === this.credentials()) this.user.set(user);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401 && credentials) {
        this.expire(`Bearer ${credentials.accessToken}`);
      }
      else throw error;
    }
  }

  async authenticate(mode: 'login' | 'register', email: string, password: string): Promise<void> {
    const session = await firstValueFrom(this.http.post<Session>(`/api/auth/${mode}`, { email: email.trim().toLowerCase(), password }, { timeout: 12000 }));
    const credentials = { accessToken: session.accessToken, expiresAt: session.expiresAt };
    this.credentials.set(credentials);
    this.sessionExpired.set(false);
    this.user.set(session.user);
    // Tab-local storage survives reloads; no password or operator credential is stored.
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials)); } catch { /* Memory-only session remains usable. */ }
  }

  async logout(): Promise<void> {
    try {
      if (this.hasSession()) await firstValueFrom(this.http.post('/api/auth/logout', {}, { timeout: 8000 }));
    }
    finally { this.clear(); }
  }

  expire(authorization: string): boolean {
    const credentials = this.credentials();
    if (!credentials || authorization !== `Bearer ${credentials.accessToken}`) return false;
    this.clear();
    this.sessionExpired.set(true);
    return true;
  }

  clear(): void {
    this.credentials.set(null);
    this.user.set(null);
    this.sessionExpired.set(false);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be disabled. */ }
  }

  private storedSession(): StoredSession | null {
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { accessToken?: unknown; expiresAt?: unknown } | null;
      return data && typeof data.accessToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(data.accessToken)
        && typeof data.expiresAt === 'string' && Number.isFinite(Date.parse(data.expiresAt))
        ? { accessToken: data.accessToken, expiresAt: data.expiresAt } : null;
    } catch { return null; }
  }
}
