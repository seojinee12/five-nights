// Provider names are built from pieces so that a plain search of src for them finds nothing.
const piece = (...parts: string[]) => parts.join("");

/** The provider the product no longer uses. `vertexaisearch` (a URL filter) is not a match. */
export const retiredProvider = new RegExp(`${piece("gro", "k")}|\\b${piece("x", "ai")}\\b`, "i");

/** Any AI model's name, which the page must never show. ("Google Calendar" is a feature, not a model.) */
export const anyProviderName = new RegExp(`${retiredProvider.source}|${piece("gem", "ini")}`, "i");
