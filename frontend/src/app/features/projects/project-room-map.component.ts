import { Component, computed, input, output } from '@angular/core';
import type { ProjectRoom } from '../../core/ep2/ep2.types';
import type { ScenePlan } from '../../core/ep2/scene-plan.service';
import type { Point2 } from '../../core/floorplan/floorplan.types';
import { pointInPolygon, polygonCentroid } from '../../core/floorplan/geometry-utils';

@Component({
  selector: 'app-project-room-map',
  template: `
    @if (drawing(); as plan) {
      <figure class="room-map" aria-label="Plano 2D del proyecto">
        <svg [attr.viewBox]="plan.viewBox" role="group" aria-label="Selecciona una habitación del plano">
          @for (space of plan.rooms; track space.id) {
            @let room = linkedRooms().get(space.id);
            <svg:g class="room-map__room" [class.room-map__room--selected]="room?.id === selectedRoomId()"
              [attr.role]="room ? 'button' : null" [attr.tabindex]="room && !disabled() ? 0 : null"
              [attr.aria-label]="room ? space.number + '. ' + room.name : null"
              [attr.aria-pressed]="room ? room.id === selectedRoomId() : null"
              [attr.aria-disabled]="room && disabled() ? true : null"
              (click)="choose(room)" (keydown.enter)="choose(room, $event)" (keydown.space)="choose(room, $event)">
              <svg:title>{{ space.number }}. {{ room?.name ?? space.name + ' (sin vincular)' }}</svg:title>
              <svg:polygon [attr.points]="space.points" />
              <svg:text aria-hidden="true" [attr.x]="space.label[0]" [attr.y]="space.label[1]"
                [attr.font-size]="plan.labelSize" dominant-baseline="central" text-anchor="middle">{{ space.number }}</svg:text>
            </svg:g>
          }
          @for (wall of plan.walls; track wall.id) {
            <svg:polygon class="room-map__wall" [attr.points]="wall.points" aria-hidden="true" />
          }
        </svg>
      </figure>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .room-map {
      margin: 0;
      padding: 8px;
      border: 1px solid #dfe7db;
      border-radius: 10px;
      background: #f8faf6;
    }
    svg { display: block; width: 100%; height: auto; max-height: 400px; aspect-ratio: 16 / 9; }
    .room-map__wall { fill: #667970; pointer-events: none; }
    .room-map__room polygon {
      fill: #eff1ee; stroke: #aab9ae; stroke-width: 1; vector-effect: non-scaling-stroke;
    }
    .room-map__room { -webkit-tap-highlight-color: transparent; }
    .room-map__room:focus { outline: none; }
    .room-map__room text { fill: #596b61; font-weight: 650; pointer-events: none; }
    .room-map__room[role='button'] polygon { fill: #e0ebda; }
    .room-map__room[tabindex='0'] { cursor: pointer; }
    .room-map__room[tabindex='0']:hover polygon {
      fill: #cbdcc3; stroke: #245442; stroke-width: 2;
    }
    .room-map__room.room-map__room--selected polygon { fill: #245442; stroke: #183b2e; }
    .room-map__room.room-map__room--selected:hover polygon { fill: #306851; stroke: #183b2e; }
    .room-map__room:focus-visible polygon {
      stroke: #ab6b38; stroke-width: 3; stroke-dasharray: 6 3;
    }
    .room-map__room.room-map__room--selected:focus-visible polygon {
      stroke: #f8c68d; stroke-width: 3;
    }
    .room-map__room.room-map__room--selected text { fill: #fff; }
  `,
})
export class ProjectRoomMapComponent {
  readonly plan = input.required<ScenePlan>();
  readonly rooms = input.required<ProjectRoom[]>();
  readonly selectedRoomId = input<string | null>(null);
  readonly disabled = input(false);
  readonly roomSelected = output<string>();

  readonly linkedRooms = computed(() => new Map(
    this.rooms().flatMap(room => room.sceneRoomId ? [[room.sceneRoomId, room] as const] : []),
  ));

  readonly drawing = computed(() => {
    const plan = this.plan();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const { polygon } of [...plan.rooms, ...plan.walls]) {
      for (const [x, y] of polygon) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    const span = Math.max(right - left, bottom - top);
    if (!Number.isFinite(span) || span <= 0) return null;
    const pad = span * .04;
    return {
      viewBox: [left - pad, top - pad, right - left + 2 * pad, bottom - top + 2 * pad].join(' '),
      labelSize: span * .037,
      rooms: plan.rooms.map((room, index) => ({
        ...room, number: index + 1, points: svgPoints(room.polygon), label: labelPosition(room.polygon),
      })),
      walls: plan.walls.map(wall => ({ id: wall.id, points: svgPoints(wall.polygon) })),
    };
  });

  choose(room: ProjectRoom | undefined, event?: Event): void {
    if (!room || this.disabled()) return;
    event?.preventDefault();
    this.roomSelected.emit(room.id);
  }
}

function svgPoints(polygon: Point2[]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

function labelPosition(polygon: Point2[]): Point2 {
  const center = polygonCentroid(polygon);
  if (pointInPolygon(center, polygon)) return center;
  const [start, end] = polygon;
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}
