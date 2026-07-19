import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ScreenStateGate } from "@/components/screen-state-gate";
import { DemoProvider } from "@/lib/demo-state";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <div className="relative flex h-dvh overflow-hidden bg-bg text-ink">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-8 pt-6 pb-12">
              <Suspense>
                <ScreenStateGate>{children}</ScreenStateGate>
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </DemoProvider>
  );
}
