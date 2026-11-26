import {
  ALL_UPGRADE_IDS,
  AREA_NAMES,
  type AreaId,
  type DebugBridge,
  type WeaponId,
} from '../contracts/index.ts';
import { PALETTES } from '../data/palettes.ts';
import { WEAPONS } from '../data/weapons.ts';

export class DebugDrawer {
  private readonly el: HTMLDivElement;
  private readonly infoEl: HTMLPreElement;
  private readonly bridge: DebugBridge;
  private visible = false;
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, bridge: DebugBridge) {
    this.bridge = bridge;
    this.el = document.createElement('div');
    this.el.id = 'krunked-debug-drawer';
    this.el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'z-index:9999',
      'width:300px',
      'max-height:85vh',
      'overflow:auto',
      'background:rgba(10,10,12,0.92)',
      'color:#f4f4f4',
      'border:1px solid #fa0000',
      'padding:10px',
      'font:11px/1.35 "Courier New",monospace',
      'display:none',
      'pointer-events:auto',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'KRUNKED WELL — DEBUG (F9)';
    title.style.cssText = 'font-weight:bold;color:#fa0000;margin-bottom:6px;letter-spacing:1px;';
    this.el.appendChild(title);

    this.infoEl = document.createElement('pre');
    this.infoEl.style.cssText = 'margin:0 0 8px 0;white-space:pre-wrap;font-size:10px;color:#d8d8d8;';
    this.el.appendChild(this.infoEl);

    const makeRow = (label: string): HTMLDivElement => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom:6px;';
      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.cssText = 'color:#999;font-size:10px;margin-bottom:3px;';
      wrap.appendChild(lbl);
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
      wrap.appendChild(btns);
      this.el.appendChild(wrap);
      return btns;
    };

    const makeBtn = (parent: HTMLElement, label: string, onClick: () => void): void => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText =
        'background:#1b1b1f;color:#fafafa;border:1px solid #444;padding:2px 6px;font:10px "Courier New",monospace;cursor:pointer;';
      btn.addEventListener('click', onClick);
      parent.appendChild(btn);
    };

    // Warp buttons
    const warpRow = makeRow('WARP BIOME');
    for (const area of [1, 2, 3, 4, 5] as AreaId[]) {
      makeBtn(warpRow, `${area}:${AREA_NAMES[area]}`, () => this.bridge.warpTo(area, 1));
    }

    // Weapons
    const wepRow = makeRow('WEAPON');
    for (const w of WEAPONS) {
      makeBtn(wepRow, w.shortName, () => this.bridge.setWeapon(w.id as WeaponId, false));
    }
    makeBtn(wepRow, 'GEM HIGH', () => {
      const st = this.bridge.getState();
      this.bridge.setGems(st.gems + 100, 120);
      this.bridge.setWeapon(st.player.weaponId, true);
    });

    // Cheats & Testing
    const actRow = makeRow('ACTIONS');
    makeBtn(actRow, 'HP 8/8', () => this.bridge.setHp(8, 8));
    makeBtn(actRow, '+1000 GEMS', () => this.bridge.setGems(this.bridge.getState().gems + 1000));
    makeBtn(actRow, 'UPGRADE UI', () => this.bridge.openUpgradeSelect());
    makeBtn(actRow, 'BOSS -900', () => this.bridge.damageBoss(900));
    makeBtn(actRow, 'KILL BOSS', () => this.bridge.damageBoss(4000));
    makeBtn(actRow, 'ALL UGS', () => {
      for (const id of ALL_UPGRADE_IDS) this.bridge.grantUpgrade(id);
    });
    makeBtn(actRow, 'PALETTE +1', () => {
      const next = (this.bridge.getPaletteId() + 1) % PALETTES.length;
      this.bridge.setPalette(next);
    });
    makeBtn(actRow, 'TOUCH ON', () => this.bridge.triggerTouch(true));
    makeBtn(actRow, 'TOUCH OFF', () => this.bridge.triggerTouch(false));

    container.appendChild(this.el);

    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F9') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(fps: number): void {
    if (!this.visible) return;
    const st = this.bridge.getState();
    const inp = this.bridge.getInputState();
    const aud = this.bridge.getAudioState();
    const pack = this.bridge.getPackState();
    const p = st.player;
    this.infoEl.textContent = [
      `FPS: ${fps.toFixed(0)} | TICK: ${st.tick} | HASH: ${this.bridge.getHash()}`,
      `MODE: ${st.mode} | ${st.area}-${st.level} ${AREA_NAMES[st.area]} | HARD:${st.hardMode ? 'Y' : 'N'}`,
      `POS: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) VEL: (${p.vx.toFixed(2)}, ${p.vy.toFixed(2)})`,
      `HP: ${p.hp}/${p.hpMax} (+${p.heartPieces}/4) | CHG: ${p.ammo}/${p.ammoMax} | O2: ${p.oxygen}`,
      `GEMS: ${st.gems} | STREAK: ${st.gemStreak} (${st.gemHigh ? 'HIGH' : 'norm'}) | COMBO: ${st.combo}`,
      `ENEMIES: ${st.enemies.length} | BOSS: ${st.boss ? `P${st.boss.phase} HP:${st.boss.hp}` : 'none'}`,
      `INPUT: ${inp.lastSource} | TOUCH:${inp.touchActive} | PAD:${inp.gamepadConnected}`,
      `PACK: ${pack.activePack} (${pack.customPackSource}) | BGM: ${aud.currentTrack ?? '-'}`,
    ].join('\n');
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.el.remove();
  }
}
