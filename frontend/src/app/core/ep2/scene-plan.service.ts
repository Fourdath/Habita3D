import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseFloorplan } from '../floorplan/cubicasa-parser';
import { FLOORPLAN_URL } from '../floorplan/floorplan.constants';
import { polygonArea } from '../floorplan/geometry-utils';
import type { SceneRoom } from './ep2.types';

@Injectable({ providedIn: 'root' })
export class ScenePlanService {
  private readonly http = inject(HttpClient);
  async rooms(): Promise<SceneRoom[]> {
    const text = await firstValueFrom(this.http.get(FLOORPLAN_URL, { responseType: 'text' }));
    return parseFloorplan(text).rooms.map(room => ({ id: room.id, name: room.name || room.id, areaM2: polygonArea(room.polygon) }));
  }
}
