// Shows each display's number in the middle of it for a moment, so "Display 2" means something.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_SECONDS = 2;

export class DisplayIdentifier {
  private labels: St.Label[] = [];
  private timeout = 0;

  /** `monitors` lists monitor indices in display order: the first gets 1. */
  show(monitors: readonly number[]): void {
    this.hide();
    monitors.forEach((monitor, i) => {
      const geometry = global.display.get_monitor_geometry(monitor);
      const label = new St.Label({
        text: `${i + 1}`,
        style_class: 'gnometangle-identify',
        opacity: 0,
      });
      Main.layoutManager.uiGroup.add_child(label);
      label.set_position(
        geometry.x + Math.round((geometry.width - label.width) / 2),
        geometry.y + Math.round((geometry.height - label.height) / 2),
      );
      label.ease({ opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
      this.labels.push(label);
    });
    this.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SHOW_SECONDS, () => {
      this.timeout = 0;
      this.hide();
      return GLib.SOURCE_REMOVE;
    });
  }

  hide(): void {
    if (this.timeout) GLib.source_remove(this.timeout);
    this.timeout = 0;
    for (const label of this.labels) label.destroy();
    this.labels = [];
  }

  destroy(): void {
    this.hide();
  }
}
