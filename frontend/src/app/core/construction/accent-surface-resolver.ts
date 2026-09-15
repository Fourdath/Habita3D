import type { Floorplan } from '../floorplan/floorplan.types';
import { distance } from '../floorplan/geometry-utils';
import { isConcreteAssembly } from './wall-assembly.catalog';
import type { AccentCandidate, AccentKind, WallConstruction } from './wall-assembly.types';

interface ScoredCandidate extends AccentCandidate {
  score: number;
}

/**
 * Picks the wall faces that may carry an exposed-brick or exposed-concrete finish.
 *
 * Exactly ONE face per room: brick and concrete are accent surfaces, so applying them to
 * every wall turns a house into a warehouse. Brick goes to living/dining rooms; concrete
 * only where the assembly was already inferred as concrete by thickness. Wet rooms are
 * excluded — they take tile, not an accent. Ties break toward the interior face of an
 * exterior wall, then the longest face.
 */
export function resolveAccentCandidates(
  floorplan: Floorplan, constructions: readonly WallConstruction[],
): AccentCandidate[] {
  const roomsById = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const bestPerRoom = new Map<string, ScoredCandidate>();

  for (const construction of constructions) {
    const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
    if (!wall || wall.isRailing) continue;
    const concrete = isConcreteAssembly(construction.assemblyId);
    const lengthM = distance(wall.start, wall.end);

    for (const side of [construction.sideA, construction.sideB]) {
      if (side.environment !== 'INTERIOR' || !side.roomId) continue;
      const room = roomsById.get(side.roomId);
      if (!room || room.semantic.type === 'BATHROOM' || room.semantic.type === 'KITCHEN') continue;

      const kind: AccentKind | null = room.isLiving ? 'BRICK' : concrete ? 'CONCRETE' : null;
      if (!kind) continue;

      const score = (kind === 'BRICK' ? 1000 : 0) + (wall.isExterior ? 100 : 0) + lengthM;
      const best = bestPerRoom.get(room.id);
      if (!best || score > best.score) {
        bestPerRoom.set(room.id, {
          score,
          wallId: construction.wallId,
          side: side.side,
          roomId: room.id,
          kind,
          reason: kind === 'BRICK' ? 'LIVING_ACCENT' : 'CONCRETE_ASSEMBLY',
        });
      }
    }
  }

  return [...bestPerRoom.values()].map(({ wallId, side, roomId, kind, reason }) => ({
    wallId, side, roomId, kind, reason,
  }));
}
