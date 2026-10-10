import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth/session";
import { Header, Page, PageSpinner } from "@/components/ui/Shell";
import { NewGameForm } from "./NewGameForm";

export const metadata: Metadata = { title: "New game" };

export default function NewGamePage() {
  return (
    <Page>
      <Header title="New game" />
      <Suspense fallback={<PageSpinner />}>
        <Form />
      </Suspense>
    </Page>
  );
}

async function Form() {
  await requireUserId("/new");
  return <NewGameForm />;
}
