import type { DayPass } from './types.js';

export class PaymentTracker {
    private dayPasses: Map<string, DayPass> = new Map();
    private durationMs: number;

    constructor(durationHours: number = 24) {
        this.durationMs = durationHours * 60 * 60 * 1000;
    }

    grantDayPass(unicityId: string): DayPass {
        const now = Date.now();
        const pass: DayPass = {
            unicityId,
            grantedAt: now,
            expiresAt: now + this.durationMs,
        };
        this.dayPasses.set(unicityId.toLowerCase(), pass);
        console.log(`[Payment] Day pass granted to ${unicityId}, expires in ${this.durationMs / 3600000}h`);
        return pass;
    }

    hasValidPass(unicityId: string): boolean {
        const pass = this.dayPasses.get(unicityId.toLowerCase());
        if (!pass) return false;
        return Date.now() < pass.expiresAt;
    }

    getPass(unicityId: string): DayPass | null {
        const pass = this.dayPasses.get(unicityId.toLowerCase());
        if (!pass) return null;
        if (Date.now() >= pass.expiresAt) {
            this.dayPasses.delete(unicityId.toLowerCase());
            return null;
        }
        return pass;
    }

    // Cleanup expired passes (for memory management in long-running server)
    cleanup(): void {
        const now = Date.now();
        for (const [id, pass] of this.dayPasses) {
            if (now >= pass.expiresAt) {
                this.dayPasses.delete(id);
            }
        }
    }
}
