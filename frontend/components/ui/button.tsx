import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
  {
    variants: {
      variant: {
        default: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
        destructive: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
        outline: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
        secondary: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
        ghost: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
        link: "border border-gray-700 bg-black text-white hover:bg-gray-900 hover:text-white",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
