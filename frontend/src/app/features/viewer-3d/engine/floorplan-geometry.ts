import * as THREE from 'three';

import type { SurfaceManifest } from '../../../core/budget/surface-manifest.types';
import { resolveAccentCandidates } from '../../../core/construction/accent-surface-resolver';
import { resolveBaseboardSegments } from '../../../core/construction/baseboard-resolver';
import { isConcreteAssembly } from '../../../core/construction/wall-assembly.catalog';
import { resolveAllWallConstructions } from '../../../core/construction/wall-construction-resolver';
import { resolveWallFaceSpans } from '../../../core/construction/wall-side-resolver';
import { calculateWallFaceRectangles, openingMeters, wallFaceNetArea } from '../../../core/construction/wall-face-geometry';
import { resolveKitchenRuns } from '../../../core/floorplan/kitchen-run-resolver';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';
import { distance, polygonArea, polygonCentroid } from '../../../core/floorplan/geometry-utils';
import type { RoomSemanticType } from '../../../core/floorplan/room-semantic.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import type { SurfaceFinishRole } from '../../../core/materials/material.types';
import { WAINSCOT_TOP_M } from '../../../core/materials/style-material-presets';
import { resolveFinishByRole } from '../../../core/materials/surface-material-resolver';
import { buildFixtureJobs } from './fixtures/procedural-fixture-builder';
import { applyMetricBoxUvs } from './materials/physical-uv-mapper';
import type { MaterialRegistry } from './materials/material-registry';
import type { CollisionSegment, FinishResolver, FloorplanBuildResult, MeshJob } from './surface-mesh.types';
import { FLOORPLAN_FLOOR_THICKNESS, FLOORPLAN_WALL_HEIGHT } from './viewer-3d.constants';
import {
  centerlineSubQuad, collectOpenings, extrudedPolygonGeometry, planSegmentBoxGeometry,
  roomPlaneGeometry, wallAlignedBox, wallFaceGeometry,
} from './wall-geometry-primitives';

export const WALL_HEIGHT_M = FLOORPLAN_WALL_HEIGHT;
export const FLOOR_THICKNESS_M = FLOORPLAN_FLOOR_THICKNESS;
const CEILING_THICKNESS_M = 0.08;
const BASEBOARD_HEIGHT_M = 0.08;
const BASEBOARD_DEPTH_M = 0.018;
const TRIM_WIDTH_M = 0.07;
const TRIM_PROJECTION_M = 0.025;
const WINDOW_FRAME_WIDTH_M = 0.055;
const WINDOW_PROJECTION_M = 0.035;
const WINDOW_SILL_HEIGHT_M = 0.035;
const COUNTERTOP_HEIGHT_M = 0.9;
const BACKSPLASH_TOP_M = 1.5;
const MAX_ROOM_LIGHTS = 14;
const EPS = 1e-3;

interface RoomLight {
  position: [number, number, number];
  distance: number;
  scale: number;
}

/**
 * Builds the whole floor plan, and returns the SURFACE MANIFEST alongside it: the budget
 * is a take-off of what was actually built, not a second parallel estimate of the plan.
 *
 * Geometry is built once and every mesh is tagged with its finish role, so switching
 * interior style only re-resolves materials.
 */
export async function buildFloorplanGroup(
  floorplan: Floorplan, registry: MaterialRegistry, styleId: InteriorStyleId,
): Promise<FloorplanBuildResult> {
  const constructions = resolveAllWallConstructions(floorplan);
  const kitchenRuns = resolveKitchenRuns(floorplan, constructions);
  const accents = resolveAccentCandidates(floorplan, constructions);
  const roomsById = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const resolveFinish: FinishResolver = (userData) => resolveFinishByRole(styleId, userData);

  const manifest: SurfaceManifest = {
    wallFaces: [], floors: [], ceilings: [], baseboards: [], backsplash: [], concrete: [],
  };
  const collisionSegments: CollisionSegment[] = [];
  const jobs: MeshJob[] = [];
  const lights: RoomLight[] = [];

  // ── wall cores (the construction system) ──────────────────────────────────
  for (const wall of floorplan.walls) {
    if (wall.polygon.length < 3) continue;
    const wallLength = distance(wall.start, wall.end);
    if (wallLength < EPS) continue;
    const construction = constructions.find((candidate) => candidate.wallId === wall.id);
    const openings = collectOpenings(floorplan, wall, wallLength);

    const spans: Array<[number, number, number, number, boolean]> = [];
    let cursor = 0;
    for (const opening of openings) {
      if (opening.tStart > cursor + EPS) spans.push([cursor, opening.tStart, 0, WALL_HEIGHT_M, true]);
      if (opening.sillHeight > EPS) spans.push([opening.tStart, opening.tEnd, 0, opening.sillHeight, true]);
      if (opening.lintelHeight < WALL_HEIGHT_M - EPS) {
        spans.push([opening.tStart, opening.tEnd, opening.lintelHeight, WALL_HEIGHT_M, opening.sillHeight > EPS]);
      }
      cursor = opening.tEnd;
    }
    if (cursor < 1 - EPS) spans.push([cursor, 1, 0, WALL_HEIGHT_M, true]);

    for (const [tStart, tEnd, yBottom, yTop, blocks] of spans) {
      const quad = centerlineSubQuad(wall, tStart, tEnd);
      if (quad.length < 3) continue;
      jobs.push({
        geometry: extrudedPolygonGeometry(quad, yTop - yBottom, yBottom),
        materialId: 'WALL_CORE_STRUCTURE',
        name: `wall-core-${wall.id}`,
        userData: { semanticType: 'wall-structure', wallId: wall.id, assemblyId: construction?.assemblyId },
      });
      if (blocks && yBottom < 1.7) {
        collisionSegments.push({
          start: [
            wall.start[0] + (wall.end[0] - wall.start[0]) * tStart,
            wall.start[1] + (wall.end[1] - wall.start[1]) * tStart,
          ],
          end: [
            wall.start[0] + (wall.end[0] - wall.start[0]) * tEnd,
            wall.start[1] + (wall.end[1] - wall.start[1]) * tEnd,
          ],
          half: wall.thickness / 2,
        });
      }
    }

    if (construction && isConcreteAssembly(construction.assemblyId)) {
      const netArea = wallFaceNetArea(calculateWallFaceRectangles(floorplan, wall, WALL_HEIGHT_M));
      manifest.concrete.push({ wallId: wall.id, volumeM3: netArea * wall.thickness });
    }
  }

  // ── finishes, per FACE ────────────────────────────────────────────────────
  for (const construction of constructions) {
    const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
    if (!wall) continue;
    const length = distance(wall.start, wall.end);
    if (length < EPS) continue;
    const faceRectangles = calculateWallFaceRectangles(floorplan, wall, WALL_HEIGHT_M);

    for (const side of [construction.sideA, construction.sideB].flatMap((face) => resolveWallFaceSpans(wall, floorplan, face))) {
      if (side.environment === 'UNKNOWN') continue;
      const rectangles = faceRectangles.map((rectangle) => {
        const startM = Math.max(rectangle.startM, side.startM);
        const endM = Math.min(rectangle.endM, side.endM);
        return { ...rectangle, startM, endM, widthM: endM - startM };
      }).filter((rectangle) => rectangle.widthM > EPS);
      const room = side.roomId ? roomsById.get(side.roomId) : undefined;
      const roomSemantic: RoomSemanticType = room?.semantic.type ?? 'DRY';
      const sideSign: 1 | -1 = side.side === 'A' ? 1 : -1;
      const accent = accents.find((candidate) => candidate.wallId === wall.id && candidate.side === side.side && candidate.roomId === side.roomId);
      const isBathroomFace = roomSemantic === 'BATHROOM' && side.environment === 'INTERIOR';

      const entry = {
        wallId: wall.id,
        side: side.side,
        environment: side.environment,
        assemblyId: construction.assemblyId,
        roomId: side.roomId,
        roomSemantic,
        accentKind: accent?.kind,
        rects: rectangles.map((rectangle) => ({ widthM: rectangle.widthM, heightM: rectangle.heightM })),
        areaM2: wallFaceNetArea(rectangles),
        wainscotAreaM2: 0,
      };

      for (const rectangle of rectangles) {
        // A face rectangle is cut at the wainscot height when the room next to it asks
        // for it: tile below, paint above, same face, one style switch away.
        const crossesWainscot = isBathroomFace
          && rectangle.bottomM < WAINSCOT_TOP_M - EPS
          && rectangle.topM > WAINSCOT_TOP_M + EPS;
        const bands: Array<[number, number, SurfaceFinishRole]> = crossesWainscot
          ? [
              [rectangle.bottomM, WAINSCOT_TOP_M, 'BATHROOM_WAINSCOT'],
              [WAINSCOT_TOP_M, rectangle.topM, 'BATHROOM_ABOVE'],
            ]
          : [[
              rectangle.bottomM,
              rectangle.topM,
              isBathroomFace
                ? (rectangle.bottomM < WAINSCOT_TOP_M - EPS ? 'BATHROOM_WAINSCOT' : 'BATHROOM_ABOVE')
                : side.environment === 'EXTERIOR' ? 'EXTERIOR' : 'DRY_WALL',
            ]];

        for (const [bottomM, topM, finishRole] of bands) {
          const userData = {
            semanticType: side.environment === 'EXTERIOR' ? 'exterior-finish' : 'wall-finish',
            finishRole,
            accentKind: accent?.kind,
            wallId: wall.id,
            wallSide: side.side,
            roomId: side.roomId,
            roomSemantic,
            environment: side.environment,
            assemblyId: construction.assemblyId,
          };
          if (finishRole === 'BATHROOM_WAINSCOT') {
            entry.wainscotAreaM2 += rectangle.widthM * (topM - bottomM);
          }
          jobs.push({
            geometry: wallFaceGeometry(
              wall, rectangle.startM / length, rectangle.endM / length, bottomM, topM, sideSign, length,
            ),
            materialId: resolveFinish(userData),
            name: `wall-finish-${wall.id}-${side.side}`,
            userData,
          });
        }
      }
      manifest.wallFaces.push(entry);
    }
  }

  // ── structural slab and ceiling ───────────────────────────────────────────
  if (floorplan.outerPerimeter.length >= 3) {
    jobs.push({
      geometry: extrudedPolygonGeometry(floorplan.outerPerimeter, FLOOR_THICKNESS_M, -FLOOR_THICKNESS_M),
      materialId: 'DEFAULT_FLOOR_NEUTRAL',
      name: 'floor-slab',
      userData: { semanticType: 'floor-structure' },
    });
    jobs.push({
      geometry: extrudedPolygonGeometry(floorplan.outerPerimeter, CEILING_THICKNESS_M, WALL_HEIGHT_M),
      materialId: 'CEILING_WHITE',
      name: 'ceiling-slab',
      userData: { semanticType: 'ceiling-structure' },
    });
  }

  // ── per-room floors and ceilings ──────────────────────────────────────────
  for (const room of floorplan.rooms) {
    if (room.polygon.length < 3) continue;
    const areaM2 = polygonArea(room.polygon);

    const floorData = {
      semanticType: 'room-floor',
      finishRole: (room.semantic.type === 'BATHROOM' ? 'FLOOR_BATH' : 'FLOOR_DRY') as SurfaceFinishRole,
      roomId: room.id,
      roomSemantic: room.semantic.type,
    };
    jobs.push({
      geometry: roomPlaneGeometry(room.polygon, false),
      materialId: resolveFinish(floorData),
      name: `room-floor-${room.id}`,
      userData: floorData,
      y: 0.004,
    });
    manifest.floors.push({ roomId: room.id, name: room.name, semantic: room.semantic.type, areaM2 });

    const ceilingData = {
      semanticType: 'room-ceiling',
      finishRole: 'CEILING' as SurfaceFinishRole,
      roomId: room.id,
      roomSemantic: room.semantic.type,
    };
    jobs.push({
      geometry: roomPlaneGeometry(room.polygon, true),
      materialId: resolveFinish(ceilingData),
      name: `room-ceiling-${room.id}`,
      userData: ceilingData,
      y: WALL_HEIGHT_M - 0.004,
    });
    manifest.ceilings.push({ roomId: room.id, areaM2 });
  }

  // ── baseboards ────────────────────────────────────────────────────────────
  for (const segment of resolveBaseboardSegments(floorplan, constructions)) {
    const userData = {
      semanticType: 'baseboard',
      finishRole: 'BASEBOARD' as SurfaceFinishRole,
      roomId: segment.roomId,
      wallId: segment.wallId,
      wallSide: segment.wallSide,
    };
    jobs.push({
      geometry: planSegmentBoxGeometry(
        segment.start, segment.end, BASEBOARD_HEIGHT_M, BASEBOARD_DEPTH_M, BASEBOARD_HEIGHT_M / 2,
      ),
      materialId: resolveFinish(userData),
      name: `baseboard-${segment.id}`,
      userData,
    });
    manifest.baseboards.push({ lengthM: segment.lengthM, roomId: segment.roomId });
  }

  addDoors(jobs, floorplan, resolveFinish);
  addWindows(jobs, floorplan, resolveFinish);

  // ── kitchen backsplash: only the stretch behind the run ───────────────────
  for (const run of kitchenRuns) {
    const runLength = distance(run.start, run.end);
    if (runLength < EPS) continue;
    const height = BACKSPLASH_TOP_M - COUNTERTOP_HEIGHT_M;
    const userData = {
      semanticType: 'kitchen-backsplash',
      finishRole: 'BACKSPLASH' as SurfaceFinishRole,
      roomId: run.roomId,
      wallId: run.wallId,
      wallSide: run.wallSide,
      kitchenRunId: run.id,
    };
    jobs.push({
      geometry: planSegmentBoxGeometry(run.start, run.end, height, 0.012, COUNTERTOP_HEIGHT_M + height / 2),
      materialId: resolveFinish(userData),
      name: `kitchen-backsplash-${run.id}`,
      userData,
    });
    manifest.backsplash.push({
      runId: run.id, roomId: run.roomId, lengthM: runLength, areaM2: runLength * height,
    });
  }

  for (const fixture of floorplan.fixtures) {
    jobs.push(...buildFixtureJobs(fixture, resolveFinish, floorplan.fixtures));
  }

  // ── luminaires ────────────────────────────────────────────────────────────
  const ranked = floorplan.rooms
    .filter((room) => room.polygon.length >= 3)
    .map((room) => ({ room, area: polygonArea(room.polygon), center: polygonCentroid(room.polygon) }))
    .sort((left, right) => right.area - left.area);

  for (const [index, { room, area, center }] of ranked.entries()) {
    const geometry = new THREE.CylinderGeometry(0.11, 0.14, 0.05, 20);
    applyMetricBoxUvs(geometry);
    jobs.push({
      geometry,
      materialId: 'LIGHT_FIXTURE',
      name: `light-${room.id}`,
      userData: { semanticType: 'lightFixture', roomId: room.id },
      position: [center[0], WALL_HEIGHT_M - 0.045, -center[1]],
    });
    if (index < MAX_ROOM_LIGHTS) {
      lights.push({
        position: [center[0], WALL_HEIGHT_M - 0.3, -center[1]],
        distance: Math.max(4.5, Math.sqrt(area) * 2.4),
        scale: clamp(Math.sqrt(Math.max(area, 1)) / 3, 0.7, 1.3),
      });
    }
  }

  // ── materialize ───────────────────────────────────────────────────────────
  const materials = await registry.warm(jobs.map((job) => job.materialId)).catch((error: unknown) => {
    for (const job of jobs) job.geometry.dispose();
    throw error;
  });
  const group = new THREE.Group();
  group.name = 'habita3d-floorplan';

  for (const job of jobs) {
    const material = materials.get(job.materialId);
    const mesh = new THREE.Mesh(job.geometry, material);
    mesh.name = job.name;
    mesh.userData = job.userData;
    // The resolved finish stays on the mesh, so a diagnostic overlay can restore the
    // exact material without relying on applyStyle having written it first.
    mesh.userData['surfaceMaterialId'] = job.materialId;
    if (job.position) mesh.position.set(job.position[0], job.position[1], job.position[2]);
    if (job.y !== undefined) mesh.position.y = job.y;
    if (job.rotationY !== undefined) mesh.rotation.y = job.rotationY;
    mesh.castShadow = job.castShadow !== false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const light of lights) {
    const point = new THREE.PointLight(0xffd9b0, 0.9 * light.scale, light.distance, 2);
    point.position.set(light.position[0], light.position[1], light.position[2]);
    point.userData = { semanticType: 'roomLight', intensityScale: light.scale };
    group.add(point);
  }

  return { group, manifest, collisionSegments, constructions, accents, kitchenRuns };
}

/** Open leaves rest along a free wall span; never swing across another doorway. */
function addDoors(jobs: MeshJob[], floorplan: Floorplan, resolveFinish: FinishResolver): void {
  const parked = new Map<string, Array<[number, number]>>();
  for (const door of floorplan.doors) {
    const wall = floorplan.walls.find((candidate) => candidate.id === door.wallId);
    if (!wall) continue;
    const length = distance(wall.start, wall.end);
    if (length < EPS) continue;
    const [startM, endM] = openingMeters(door.position, door.width, length);
    const widthM = endM - startM;
    if (widthM < 0.2) continue;
    const postT = TRIM_WIDTH_M / length;
    const height = Math.min(door.height + TRIM_WIDTH_M, WALL_HEIGHT_M);

    for (const sideSign of [1, -1] as const) {
      jobs.push(wallAlignedBox({
        wall, tStart: Math.max(0, startM / length - postT), tEnd: startM / length,
        height, depth: TRIM_PROJECTION_M, centerY: height / 2, sideSign,
        finishRole: 'FRAME', semanticType: 'doorFrame',
      }, resolveFinish));
      jobs.push(wallAlignedBox({
        wall, tStart: endM / length, tEnd: Math.min(1, endM / length + postT),
        height, depth: TRIM_PROJECTION_M, centerY: height / 2, sideSign,
        finishRole: 'FRAME', semanticType: 'doorFrame',
      }, resolveFinish));
      jobs.push(wallAlignedBox({
        wall, tStart: startM / length, tEnd: endM / length,
        height: TRIM_WIDTH_M, depth: TRIM_PROJECTION_M,
        centerY: Math.min(door.height + TRIM_WIDTH_M / 2, WALL_HEIGHT_M - TRIM_WIDTH_M / 2),
        sideSign, finishRole: 'FRAME', semanticType: 'doorFrame',
      }, resolveFinish));
    }

    // A wide merged entrance is a passage. If neither side can store a full leaf,
    // show the open frame instead of inventing a panel through a wall or furniture.
    if (widthM > 1.2) continue;
    const leafWidth = widthM - 0.02;
    const occupied = [...floorplan.doors, ...floorplan.windows].filter((item) => item.wallId === wall.id)
      .map((item) => openingMeters(item.position, item.width, length));
    occupied.push(...(parked.get(wall.id) ?? []));
    const gap = TRIM_WIDTH_M + 0.015;
    const storage: Array<[number, number]> = [[startM - gap - leafWidth, startM - gap], [endM + gap, endM + gap + leafWidth]];
    const free = storage.find(([a, b]) => a >= wall.thickness / 2 && b <= length - wall.thickness / 2
      && occupied.every(([c, d]) => b + gap <= c || a - gap >= d));
    if (!free) continue;
    parked.set(wall.id, [...(parked.get(wall.id) ?? []), free]);
    const leaf = wallAlignedBox({
      wall, tStart: free[0] / length, tEnd: free[1] / length, height: door.height - 0.02,
      depth: 0.04, centerY: door.height / 2, sideSign: 1, finishRole: 'DOOR', semanticType: 'door',
    }, resolveFinish);
    leaf.name = `door-leaf-${door.id}`;
    leaf.userData['doorId'] = door.id;
    jobs.push(leaf);
  }
}

function addWindows(jobs: MeshJob[], floorplan: Floorplan, resolveFinish: FinishResolver): void {
  for (const window of floorplan.windows) {
    const wall = floorplan.walls.find((candidate) => candidate.id === window.wallId);
    if (!wall) continue;
    const length = distance(wall.start, wall.end);
    if (length < EPS) continue;
    const [startM, endM] = openingMeters(window.position, window.width, length);
    const tStart = startM / length;
    const tEnd = endM / length;
    const centerY = window.sillHeight + window.height / 2;

    jobs.push(wallAlignedBox({
      wall, tStart, tEnd, height: window.height, depth: 0.012, centerY, sideSign: 0,
      finishRole: null, semanticType: 'window', fixedMaterialId: 'WINDOW_GLASS', castShadow: false,
    }, resolveFinish));

    const frameT = Math.min(WINDOW_FRAME_WIDTH_M / length, (tEnd - tStart) / 3);
    const frameH = Math.min(WINDOW_FRAME_WIDTH_M, window.height / 3);
    const frame = (tA: number, tB: number, height: number, centre: number): void => {
      jobs.push(wallAlignedBox({
        wall, tStart: tA, tEnd: tB, height, depth: WINDOW_PROJECTION_M, centerY: centre,
        sideSign: 0, finishRole: 'FRAME', semanticType: 'windowFrame',
      }, resolveFinish));
    };

    frame(tStart, tStart + frameT, window.height, centerY);
    frame(tEnd - frameT, tEnd, window.height, centerY);
    frame(tStart, tEnd, frameH, window.sillHeight + frameH / 2);
    frame(tStart, tEnd, frameH, window.sillHeight + window.height - frameH / 2);
    if (window.width >= 1.2) {
      const centerT = (tStart + tEnd) / 2;
      frame(centerT - frameT / 2, centerT + frameT / 2, Math.max(frameH, window.height - frameH * 2), centerY);
    }

    jobs.push(wallAlignedBox({
      wall,
      tStart: Math.max(0, tStart - frameT / 2),
      tEnd: Math.min(1, tEnd + frameT / 2),
      height: WINDOW_SILL_HEIGHT_M,
      depth: wall.thickness + 0.1,
      centerY: window.sillHeight + WINDOW_SILL_HEIGHT_M / 2,
      sideSign: 0,
      finishRole: 'FRAME',
      semanticType: 'windowFrame',
    }, resolveFinish));
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
