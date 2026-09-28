import type { PointerCommand } from './pointer-command';

export class PagePointer {
  private host: HTMLElement | null = null;
  private x = 0;
  private y = 0;
  private frame = 0;
  private speed = 70;
  private finishPreview: ((completed: boolean) => void) | null = null;

  private show() {
    if (!this.host?.isConnected) {
      this.x = innerWidth / 2;
      this.y = innerHeight / 2;
      this.host = document.createElement('div');
      this.host.dataset.webbPointer = '';
      this.host.setAttribute('aria-hidden', 'true');
      this.host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;transition:none;color:#245fe9;filter:drop-shadow(0 2px 3px #fff)';
      const shadow = this.host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = '<svg width="24" height="30" viewBox="0 0 24 30"><path d="M2 2v22l6-6 5 10 5-3-5-9h9Z" fill="#245fe9" stroke="white" stroke-width="2"/></svg><span style="font:600 10px system-ui;background:#245fe9;color:white;padding:2px 5px;border-radius:4px">Webb</span>';
      document.documentElement.appendChild(this.host);
    }
    this.draw();
  }

  private draw() {
    this.x = Math.max(1, Math.min(innerWidth - 2, this.x));
    this.y = Math.max(1, Math.min(innerHeight - 2, this.y));
    if (this.host) this.host.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }

  stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.finishPreview?.(false); this.finishPreview = null; }

  command(command: PointerCommand): Element | null {
    this.show();
    if (command.kind === 'click') { this.stop(); return document.elementFromPoint(this.x, this.y); }
    if (command.kind === 'stop') { this.stop(); return null; }
    if (command.kind === 'slower' || command.kind === 'faster') {
      this.speed = Math.max(20, Math.min(200, this.speed * (command.kind === 'slower' ? 0.6 : 1.5)));
      return null;
    }
    if (command.kind !== 'move') return null;
    this.stop();
    if (command.nudge) { this.x += command.dx * 20; this.y += command.dy * 20; this.draw(); return null; }
    const started = performance.now();
    let last = started;
    const advance = (now: number) => {
      const distance = this.speed * Math.min(0.05, (now - last) / 1000);
      last = now;
      const before = `${this.x},${this.y}`;
      this.x += command.dx * distance;
      this.y += command.dy * distance;
      this.draw();
      if (now - started < 10000 && before !== `${this.x},${this.y}`) this.frame = requestAnimationFrame(advance);
    };
    this.frame = requestAnimationFrame(advance);
    return null;
  }

  async pointAt(element: Element) {
    this.stop();
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.show();
    const rect = element.getBoundingClientRect();
    const fromX = this.x, fromY = this.y;
    const toX = rect.left + rect.width / 2, toY = rect.top + rect.height / 2;
    if (document.hidden) { this.x = toX; this.y = toY; this.draw(); return true; }
    const started = performance.now();
    return new Promise<boolean>(resolve => {
      this.finishPreview = resolve;
      const advance = (now: number) => {
        const t = Math.min(1, (now - started) / 220);
        const eased = t * (2 - t);
        this.x = fromX + (toX - fromX) * eased;
        this.y = fromY + (toY - fromY) * eased;
        this.draw();
        if (t < 1) this.frame = requestAnimationFrame(advance); else { this.frame = 0; this.finishPreview = null; resolve(true); }
      };
      this.frame = requestAnimationFrame(advance);
    });
  }
}
