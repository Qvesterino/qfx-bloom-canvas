import { createFileRoute } from "@tanstack/react-router";
import { Lab } from "@/components/qfx/Lab";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <Lab />
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}
