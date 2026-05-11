import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-[#fecaca] bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca] dark:border-[rgba(248,113,113,0.35)] dark:bg-[rgba(239,68,68,0.2)] dark:text-[#fecaca] dark:hover:bg-[rgba(239,68,68,0.28)]",
        outline: "text-foreground",
        success:
          "border-[#bbf7d0] bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0] dark:border-[rgba(74,222,128,0.35)] dark:bg-[rgba(34,197,94,0.18)] dark:text-[#bbf7d0] dark:hover:bg-[rgba(34,197,94,0.26)]",
        warning:
          "border-[#fde68a] bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(245,158,11,0.2)] dark:text-[#fde68a] dark:hover:bg-[rgba(245,158,11,0.28)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
