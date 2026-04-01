import { Inngest } from "inngest";
import type { ProlifeEvents } from "./types";

export const inngest = new Inngest({
  id: "agency",
  schemas: new Map() as any,
});
