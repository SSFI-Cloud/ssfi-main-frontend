import { api } from '@/lib/api/client';

export const resultService = {
    // get race categories for filter (backend returns the array directly)
    getEventRaceCategories: async (eventId: number) => {
        const response = await api.get(`/results/${eventId}/race-categories`);
        return response.data;
    },

    // get participants for a specific race
    getParticipantsForRace: async (eventId: number, filters: any) => {
        const response = await api.get(`/results/${eventId}/participants`, { params: filters });
        return response.data;
    },

    // save results
    saveResults: async (eventId: number, data: any) => {
        const response = await api.post(`/results/${eventId}/results`, data);
        return response.data;
    },

    // toggle publication
    togglePublication: async (eventId: number, isPublished: boolean) => {
        const response = await api.post(`/results/${eventId}/publish`, { isPublished });
        return response.data;
    },

    // Next-level selection: roster of confirmed participants with best position
    // + current selection flag ({ success, data: [...] } wrapper)
    getSelectionRoster: async (eventId: number) => {
        const response = await api.get(`/results/${eventId}/selection-roster`);
        return response.data;
    },

    // Sync the full list of selected studentIds for the event
    saveSelections: async (eventId: number, studentIds: number[]) => {
        const response = await api.post(`/results/${eventId}/selections`, { studentIds });
        return response.data;
    },
};
