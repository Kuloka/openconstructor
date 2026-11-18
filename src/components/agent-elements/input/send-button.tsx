import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
import { cn } from "../utils/cn";

export type SendButtonProps = {
  state: "idle" | "typing" | "streaming";
};

// Square send / stop button: while the AI works it turns into "stop" (click → the answer is cancelled)
export function SendButton({ state }: SendButtonProps) {
  const isStreaming = state === "streaming";
  const isTyping = state === "typing";

  if (isStreaming) {
    return (
      <div className="oc-send oc-stop size-8 rounded-[8px] flex items-center justify-center cursor-pointer" title="Stop" aria-label="Stop" role="button">
        <IconPlayerStopFilled className="size-3.5" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "oc-send size-8 rounded-[8px] flex items-center justify-center",
        isTyping
          ? "bg-an-send-button-bg cursor-pointer"
          : "bg-muted cursor-default",
      )}
      title="Send"
    >
      <IconArrowUp
        className={cn(
          "size-4",
          isTyping
            ? "text-an-send-button-color"
            : "text-neutral-400 dark:text-neutral-600",
        )}
      />
    </div>
  );
}
