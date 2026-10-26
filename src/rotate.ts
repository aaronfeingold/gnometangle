// Rotates a display through Mutter's display configuration D-Bus API, the one GNOME Settings uses.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { Rotation } from './core/actions.js';
import { rotationPlan, type LogicalMonitor, type Mode } from './core/rotation.js';

const BUS = 'org.gnome.Mutter.DisplayConfig';
const OBJECT = '/org/gnome/Mutter/DisplayConfig';
/** Lasts until the next display change, like plugging in a monitor, and skips Settings' confirm dialog. */
const METHOD_TEMPORARY = 1;
const LAYOUT_PHYSICAL = 2;

type MonitorState = [
  [connector: string, vendor: string, product: string, serial: string],
  modes: [id: string, width: number, height: number, ...rest: unknown[]][],
  props: Record<string, unknown>,
];
type LogicalMonitorState = [
  x: number,
  y: number,
  scale: number,
  transform: number,
  primary: boolean,
  monitors: [connector: string, ...rest: unknown[]][],
  props: Record<string, unknown>,
];
type CurrentState = [
  serial: number,
  monitors: MonitorState[],
  logicalMonitors: LogicalMonitorState[],
  props: Record<string, unknown>,
];

function call(method: string, parameters: GLib.Variant | null): Promise<GLib.Variant> {
  return new Promise((resolve, reject) => {
    Gio.DBus.session.call(BUS, OBJECT, BUS, method, parameters, null, Gio.DBusCallFlags.NONE, -1, null, (_, res) => {
      try {
        resolve(Gio.DBus.session.call_finish(res));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

/**
 * Rotates monitor `monitor` (a Meta monitor index). Other displays stay on and shift to stay
 * connected. Resolves to the rotated monitor's connector, or null when there was nothing to do;
 * monitor indices can change with the layout, so the connector is how to find it afterwards.
 */
export async function rotateDisplay(monitor: number, rotation: Rotation): Promise<string | null> {
  const [serial, monitors, logical, props] = (await call('GetCurrentState', null)).recursiveUnpack() as CurrentState;

  const manager = global.backend.get_monitor_manager();
  const modes = new Map<string, Mode>();
  for (const [[connector], modeList] of monitors) {
    const current = modeList.find((mode) => (mode.at(-1) as Record<string, unknown>)['is-current']);
    if (current) modes.set(connector, { id: current[0], width: current[1], height: current[2] });
  }
  const connector = [...modes.keys()].find((c) => manager.get_monitor_for_connector(c) === monitor);
  if (!connector) return null;

  const layout: LogicalMonitor[] = logical.map(([x, y, scale, transform, primary, connectors]) => ({
    x,
    y,
    scale,
    transform,
    primary,
    connectors: connectors.map(([c]) => c),
  }));
  const plan = rotationPlan(layout, modes, connector, rotation, props['layout-mode'] === LAYOUT_PHYSICAL);
  if (!plan) return null;

  type Config = [number, number, number, number, boolean, [string, string, Record<string, GLib.Variant>][]];
  const config = plan.map((m): Config => [
    m.x,
    m.y,
    m.scale,
    m.transform,
    m.primary,
    m.connectors.map((c) => [c, modes.get(c)!.id, {}]),
  ]);
  await call(
    'ApplyMonitorsConfig',
    new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, METHOD_TEMPORARY, config, {}]),
  );
  return connector;
}
