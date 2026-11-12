// Tiny class joiner for the Velora components (they expect shadcn's cn()).
export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
