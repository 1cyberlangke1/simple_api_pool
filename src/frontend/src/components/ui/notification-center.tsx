import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore, type AppNotification } from "@/store/appStore";

function readNotificationPresentation(kind: AppNotification["kind"]) {
  if (kind === "ok") {
    return {
      className: "border-[#29e154]/45 bg-[#0f2f18]/95 text-white shadow-[0_18px_48px_rgba(41,225,84,0.22)]",
      icon: CheckCircle2
    };
  }
  if (kind === "warning") {
    return {
      className: "border-[#f59e0b]/45 bg-[#3b2406]/95 text-white shadow-[0_18px_48px_rgba(245,158,11,0.22)]",
      icon: TriangleAlert
    };
  }
  if (kind === "info") {
    return {
      className: "border-[#38bdf8]/45 bg-[#082f49]/95 text-white shadow-[0_18px_48px_rgba(56,189,248,0.24)]",
      icon: Info
    };
  }
  return {
    className: "border-[#ef4444]/45 bg-[#3f1010]/95 text-white shadow-[0_18px_48px_rgba(239,68,68,0.24)]",
    icon: AlertCircle
  };
}

function NotificationItem(props: {
  notification: AppNotification;
}) {
  const dismissNotification = useAppStore(function selectDismissNotification(state) {
    return state.dismissNotification;
  });
  const presentation = readNotificationPresentation(props.notification.kind);
  const Icon = presentation.icon;

  useEffect(function autoDismissNotification() {
    const timerId = window.setTimeout(function dismissAfterTimeout() {
      dismissNotification(props.notification.id);
    }, props.notification.durationMs);
    return function cleanupNotificationTimer() {
      window.clearTimeout(timerId);
    };
  }, [dismissNotification, props.notification.durationMs, props.notification.id]);

  return (
    <motion.div
      animate={{ opacity: 1, x: 0, y: 0 }}
      className={cn(
        "pointer-events-auto flex min-h-16 w-full items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl",
        presentation.className
      )}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      initial={{ opacity: 0, x: 24, y: -8 }}
      layout
      transition={{ duration: 0.18 }}
    >
      <div className="mt-0.5 rounded-full bg-white/12 p-1.5">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-6">{props.notification.text}</p>
      </div>
      <Button
        aria-label="dismiss-notification"
        className="h-8 w-8 shrink-0 rounded-full border-white/10 bg-white/8 text-white hover:bg-white/16"
        onClick={function handleDismissClick() {
          dismissNotification(props.notification.id);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}

export function NotificationCenter() {
  const notifications = useAppStore(function selectNotifications(state) {
    return state.notifications;
  });

  return (
    <div
      className="pointer-events-none fixed top-20 right-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6"
      data-notification-viewport="true"
    >
      <AnimatePresence initial={false}>
        {notifications.map(function renderNotification(notification) {
          return <NotificationItem key={notification.id} notification={notification} />;
        })}
      </AnimatePresence>
    </div>
  );
}
