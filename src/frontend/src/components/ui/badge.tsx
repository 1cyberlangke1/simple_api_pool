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
          "border-[#dc2626] bg-[#ef4444] text-white hover:bg-[#dc2626] dark:border-[#f87171] dark:bg-[#dc2626] dark:text-white dark:hover:bg-[#ef4444]",
        outline: "text-foreground",
        success:
          "border-[#16a34a] bg-[#22c55e] text-white hover:bg-[#16a34a] dark:border-[#86efac] dark:bg-[#15803d] dark:text-white dark:hover:bg-[#16a34a]",
        warning:
          "border-[#d97706] bg-[#f59e0b] text-white hover:bg-[#d97706] dark:border-[#fcd34d] dark:bg-[#b45309] dark:text-white dark:hover:bg-[#d97706]",
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
