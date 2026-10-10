import { notFound } from "next/navigation";
import DevBoard from "./DevBoard";

export default function DevBoardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevBoard />;
}
