export interface BehavioralMetrics {
  timingCv: number;           // click timing coefficient of variation
  navigationEntropy: number;  // nav path entropy bits
  mouseJitter: boolean;       // true if mouse movements show natural jitter
  clickCount: number;
  scrollVelocity: number;
  formFillSpeed: number;
}

/** Compute standard deviation of an array of numbers */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Compute Shannon entropy: -sum(p * log2(p)) */
function shannonEntropy(counts: Map<string, number>): number {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

export class BehavioralTracker {
  private clickTimestamps: number[] = [];
  private mouseMovePositions: Array<{ x: number; y: number }> = [];
  private navPathCounts: Map<string, number> = new Map();
  private scrollEvents: Array<{ time: number; y: number }> = [];
  private _clickCount = 0;
  private _mouseJitter = false;

  // Bound event handlers (preserved for removeEventListener)
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnClick: (e: MouseEvent) => void;
  private boundOnScroll: (e: Event) => void;

  constructor() {
    this.boundOnMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.boundOnClick = (e: MouseEvent) => this.onClick(e);
    this.boundOnScroll = (e: Event) => this.onScroll(e);

    // Track navigation path on construction
    this.recordNavPath();
  }

  start(): void {
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('click', this.boundOnClick);
    document.addEventListener('scroll', this.boundOnScroll, { passive: true });
  }

  stop(): void {
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('click', this.boundOnClick);
    document.removeEventListener('scroll', this.boundOnScroll);
  }

  getMetrics(): BehavioralMetrics {
    return {
      timingCv: this.computeTimingCv(),
      navigationEntropy: shannonEntropy(this.navPathCounts),
      mouseJitter: this._mouseJitter,
      clickCount: this._clickCount,
      scrollVelocity: this.computeScrollVelocity(),
      formFillSpeed: 0, // reserved for future form tracking
    };
  }

  private recordNavPath(): void {
    const path =
      typeof window !== 'undefined' ? window.location.pathname : '/';
    this.navPathCounts.set(path, (this.navPathCounts.get(path) ?? 0) + 1);
  }

  private computeTimingCv(): number {
    const recent = this.clickTimestamps.slice(-10);
    if (recent.length < 2) return 0;

    // Compute inter-click intervals
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i] - recent[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean === 0) return 0;
    return stdDev(intervals) / mean;
  }

  private computeScrollVelocity(): number {
    if (this.scrollEvents.length < 2) return 0;
    const first = this.scrollEvents[0];
    const last = this.scrollEvents[this.scrollEvents.length - 1];
    const timeDiff = last.time - first.time;
    if (timeDiff === 0) return 0;
    const distDiff = Math.abs(last.y - first.y);
    return distDiff / timeDiff; // pixels per millisecond
  }

  private onMouseMove(e: MouseEvent): void {
    const prev = this.mouseMovePositions[this.mouseMovePositions.length - 1];
    if (prev) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      // Natural human movement will have sub-pixel or non-integer amounts
      // when accounting for fractional coordinates
      if (dx % 1 !== 0 || dy % 1 !== 0) {
        this._mouseJitter = true;
      }
    }
    // Keep a sliding window of last 50 positions
    this.mouseMovePositions.push({ x: e.clientX, y: e.clientY });
    if (this.mouseMovePositions.length > 50) {
      this.mouseMovePositions.shift();
    }
  }

  private onClick(e: MouseEvent): void {
    this._clickCount++;
    this.clickTimestamps.push(e.timeStamp ?? Date.now());
    // Keep only last 20 timestamps
    if (this.clickTimestamps.length > 20) {
      this.clickTimestamps.shift();
    }
  }

  private onScroll(_e: Event): void {
    this.scrollEvents.push({
      time: Date.now(),
      y: window.scrollY,
    });
    // Keep last 100 scroll events
    if (this.scrollEvents.length > 100) {
      this.scrollEvents.shift();
    }
  }
}
