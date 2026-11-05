import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type PlaceholderProps = {
  title: string
  children: ReactNode
}

export function Placeholder({ title, children }: PlaceholderProps) {
  return (
    <section>
      <Card className="gap-0 shadow-none">
        <CardContent>
          <h1 className="mb-[0.67em] text-[1.75rem] leading-[normal] font-bold">{title}</h1>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}
