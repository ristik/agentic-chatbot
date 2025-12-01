import type { ActivityConfig } from '@agentic/shared';
import { triviaActivity } from './trivia.js';
import { amaActivity } from './ama.js';
import { sportsActivity } from './sports.js';

const activities: Record<string, ActivityConfig> = {
    trivia: triviaActivity,
    ama: amaActivity,
    'sports-betting': sportsActivity,
};

export function getActivityConfig(id: string): ActivityConfig | undefined {
    return activities[id];
}

export function getAllActivities(): ActivityConfig[] {
    return Object.values(activities);
}
