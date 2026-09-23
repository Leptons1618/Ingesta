import Link from "next/link"
import { Compass } from "lucide-react"

import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"

/** Rendered inside `AppShell` for any route the workspace does not define. */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <EmptyState
        icon={<Compass />}
        title="No such page"
        description="That address is not part of the workspace. It may have been renamed, or the link that brought you here may be out of date."
        action={
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        }
      />
    </main>
  )
}
