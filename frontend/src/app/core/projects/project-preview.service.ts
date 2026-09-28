import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ProjectPreviewRequest, ProjectPreviewResponse } from './project-preview.types';

@Injectable({ providedIn: 'root' })
export class ProjectPreviewService {
  private readonly http = inject(HttpClient);

  createPreview(request: ProjectPreviewRequest): Observable<ProjectPreviewResponse> {
    return this.http.post<ProjectPreviewResponse>('/api/projects/preview', request);
  }
}
