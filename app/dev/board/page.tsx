import { testHooksEnabled } from "@/lib/testHooks";
import { notFound } from "next/navigation";
import DevBoard from "./DevBoard";

export default function DevBoardPage() {
  if (!testHooksEnabled) notFound();
  return <DevBoard />;
}
