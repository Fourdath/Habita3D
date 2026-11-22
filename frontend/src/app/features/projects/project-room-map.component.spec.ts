import { TestBed } from '@angular/core/testing';
import { TEST_PROJECT } from '../../core/ep2/ep2.fixtures';
import type { ScenePlan } from '../../core/ep2/scene-plan.service';
import { ProjectRoomMapComponent } from './project-room-map.component';

it('selects linked plan polygons with pointer and keyboard without selecting unlinked spaces', async () => {
  const first = TEST_PROJECT.rooms[0];
  const second = { ...first, id: 'second', sceneRoomId: 'scene-second' };
  const plan: ScenePlan = {
    rooms: [first.sceneRoomId!, second.sceneRoomId, 'scene-unlinked'].map((id, index) => ({
      id, name: 'Habitación', areaM2: 1,
      polygon: [[index, 0], [index + 1, 0], [index + 1, 1], [index, 1]],
    })),
    walls: [],
  };
  const fixture = TestBed.createComponent(ProjectRoomMapComponent);
  fixture.componentRef.setInput('plan', plan);
  fixture.componentRef.setInput('rooms', [first, second]);
  fixture.componentRef.setInput('selectedRoomId', first.id);
  const select = vi.fn();
  fixture.componentInstance.roomSelected.subscribe(select);
  await fixture.whenStable();

  const rooms = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.room-map__room'));
  expect(rooms[0].getAttribute('aria-pressed')).toBe('true');
  expect(rooms[1].getAttribute('aria-pressed')).toBe('false');
  expect(rooms[2].getAttribute('role')).toBeNull();
  rooms[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  rooms[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  rooms[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(select.mock.calls).toEqual([[second.id], [first.id]]);

  fixture.componentRef.setInput('selectedRoomId', second.id);
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  expect(rooms[1].getAttribute('aria-pressed')).toBe('true');
  expect(rooms[1].getAttribute('tabindex')).toBeNull();
  rooms[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(select).toHaveBeenCalledTimes(2);
});
