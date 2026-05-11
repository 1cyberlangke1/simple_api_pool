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
          "border-[#991b1b] bg-[#dc2626] text-white hover:bg-[#b91c1c] dark:border-[#f87171] dark:bg-[#b91c1c] dark:text-white dark:hover:bg-[#dc2626]",
        outline: "text-foreground",
        success:
          "border-[#166534] bg-[#16a34a] text-white hover:bg-[#15803d] dark:border-[#86efac] dark:bg-[#166534] dark:text-white dark:hover:bg-[#15803d]",
        warning:
          "border-[#92400e] bg-[#d97706] text-white hover:bg-[#b45309] dark:border-[#fcd34d] dark:bg-[#92400e] dark:text-white dark:hover:bg-[#b45309]",
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
