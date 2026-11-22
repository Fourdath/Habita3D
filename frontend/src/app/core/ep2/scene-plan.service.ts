import { Injectable } from '@angular/core';
import { parseFloorplan } from '../floorplan/cubicasa-parser';
import { validateProjectFloorplanSvg } from '../floorplan/floorplan-file';
import { polygonArea } from '../floorplan/geometry-utils';
import type { SceneRoom } from './ep2.types';

@Injectable({ providedIn: 'root' })
export class ScenePlanService {
  rooms(svg: string): SceneRoom[] {
    validateProjectFloorplanSvg(svg);
    const plan = parseFloorplan(svg);
    if (!plan.walls.length) throw new Error('El plano CubiCasa no contiene muros reconocibles.');
    const rooms = plan.rooms.map(room => ({
      id: room.id,
      name: (room.name.trim() || room.id).slice(0, 120),
      areaM2: polygonArea(room.polygon),
    }));
    if (!rooms.length || rooms.length > 100 || rooms.some(room =>
      !Number.isFinite(room.areaM2) || room.areaM2 < 0.000001 || room.areaM2 > 1_000_000
    )) throw new Error('El plano debe tener entre 1 y 100 recintos con una superficie válida.');
    return rooms;
  }
}
