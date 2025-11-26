import type { ActivityConfig } from '@agentic/shared';
import { triviaActivity } from './trivia.js';

const activities: Record<string, ActivityConfig> = {
    trivia: triviaActivity,
};

export function getActivityConfig(id: string): ActivityConfig | undefined {
    return activities[id];
}

export function getAllActivities(): ActivityConfig[] {
    return Object.values(activities);
}
