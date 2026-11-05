// Parts of the shell that are built but not offered yet.

export const FEATURES = {
    /**
     * Adding game data from a link. Imports from a link work like server
     * downloads; what is missing is checking that the host allows the page
     * to fetch from it (CORS), and explaining that when it does not.
     */
    linkSources: false,
} as const;
