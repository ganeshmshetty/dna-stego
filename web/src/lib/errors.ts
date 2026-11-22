import { ApiError } from "@/lib/types"

export interface ErrorDescription {
  message: string
  hint: string
}

export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    return { message: error.message, hint: error.hint }
  }
  return {
    message: error instanceof Error ? error.message : "Unexpected error.",
    hint: "Try the action again.",
  }
}
