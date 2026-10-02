// Shared by the server search and the client search box, which must not pull
// the server module (and its database imports) into the browser bundle.
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
