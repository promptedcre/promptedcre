// How a catalog row's title and the filter box's query are compared (ListSearch,
// ./list-search.tsx). Pure, so the server writes a row's data-title with the same words the
// box matches: lower case, accents dropped, letters and digits only.

/** A title or a query as the words it is matched by. */
export function titleWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A row's data-title: its title's words, one space apart. */
export const titleKey = (title: string): string => titleWords(title).join(" ");

/** Does a title hold every word of the query, each as the start or part of a word, in any order? */
export function titleMatches(title: string, query: string): boolean {
  const have = titleKey(title);
  return titleWords(query).every((w) => have.includes(w));
}
