import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Key,
  RotateCw,
  ServerCrash,
  Zap
} from "lucide-react";

import { ProviderBadgeIcon } from "@/components/provider/ProviderBadgeIcon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLocaleTime, formatNumber } from "@/lib/format";
import { buildErrorTypeSummaries, buildErrorTypeSummaryClassName, buildProviderCards, collectStatusSummary } from "@/lib/status";
import { useStatusOverview } from "@/hooks/useStatusOverview";
import { useAppStore } from "@/store/appStore";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

function calculateSuccessRate(successCount: number, errorCount: number) {
  const total = successCount + errorCount;
  if (total <= 0) {
    return 0;
  }
  return (successCount / total) * 100;
}

function calculateErrorRate(successCount: number, errorCount: number) {
  const total = successCount + errorCount;
  if (total <= 0) {
    return 0;
  }
  return (errorCount / total) * 100;
}

function readStatusPresentation(status: string) {
  if (status === "ok") {
    return {
      badgeVariant: "success" as const,
      icon: CheckCircle2
    };
  }
  if (status === "warning") {
    return {
      badgeVariant: "warning" as const,
      icon: AlertTriangle
    };
  }
  if (status === "error") {
    return {
      badgeVariant: "destructive" as const,
      icon: ServerCrash
    };
  }
  return {
    badgeVariant: "secondary" as const,
    icon: Activity
  };
}

export function StatusPage() {
  const language = useAppStore(function selectLanguage(state) {
    return state.language;
  });
  const translate = useAppStore(function selectTranslate(state) {
    return state.translate;
  });
  const { state } = useStatusOverview(translate);

  const summary = collectStatusSummary(state.overview);
  const providerCards = buildProviderCards(state.overview).map(function toReferenceCard(card) {
    const successCount = Number(card.snapshot.success_count || 0);
    const errorCount = Number(card.snapshot.error_count || 0);
    return {
      availableKeys: Number(card.snapshot.available_keys || 0),
      cacheTokens: Number(card.snapshot.cache_tokens || 0),
      cacheHits: Number(card.snapshot.cache_hits || 0),
      errorRate: calculateErrorRate(successCount, errorCount),
      id: String(card.name || ""),
      inputTokens: Number(card.snapshot.input_tokens || 0),
      name: String(card.name || ""),
      outputTokens: Number(card.snapshot.output_tokens || 0),
      rps: 0,
      snapshot: card.snapshot,
      status: String(card.status || "unknown"),
      successRate: calculateSuccessRate(successCount, errorCount),
      totalKeys: Number(card.snapshot.total_keys || 0),
      type: String(card.type || "")
    };
  });

  const healthStatus = String(state.overview.health?.status || "unknown");
  const healthPresentation = readStatusPresentation(healthStatus);
  const HealthIcon = healthPresentation.icon;
  const successRate = calculateSuccessRate(summary.successCount, summary.errorCount);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{translate("app.statusTitle")}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="inline-flex items-center rounded-full border bg-muted px-2.5 py-1 text-xs">
              <RotateCw className="mr-1 h-3 w-3 animate-spin-slow" />
              {translate("status.autoRefresh")}
            </span>
          </div>
        </div>
        <div className="text-sm font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md border text-center">
          {translate("status.lastUpdated")}: {state.loadedAt ? formatLocaleTime(state.loadedAt, language) : translate("message.loading")}
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="status-grid">
        <motion.div variants={item} className="h-full">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate("status.health")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                {healthStatus.toUpperCase()}
                <HealthIcon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item} className="h-full">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate("status.providers")}</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.providerCount}</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item} className="h-full">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate("status.successRate")}</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successRate.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {formatNumber(summary.successCount)} / {formatNumber(summary.successCount + summary.errorCount)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item} className="h-full">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate("status.error")}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{formatNumber(summary.errorCount)}</div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {state.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-3">
          <h2 className="text-xl font-display font-semibold tracking-tight">{translate("status.detailsTitle")}</h2>
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <span>{translate("status.proxyRouteLabel")} </span>
            <code className="rounded bg-background/80 px-1.5 py-0.5 text-foreground">/{`{provider}`}/...</code>
            <span className="mx-2">·</span>
            <span>{translate("status.cacheRouteLabel")} </span>
            <code className="rounded bg-background/80 px-1.5 py-0.5 text-foreground">/cache/{`{provider}`}/...</code>
          </div>
        </div>
        <motion.div variants={container} initial="hidden" animate="show" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providerCards.length === 0 ? (
            <motion.div variants={item} className="md:col-span-2 lg:col-span-3">
              <Card className="border-dashed">
                <CardContent className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
                  {translate("status.empty")}
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
          {providerCards.map(function renderProviderCard(providerCard) {
            const providerStatusPresentation = readStatusPresentation(providerCard.status);
            const errorTypeSummaries = buildErrorTypeSummaries(providerCard.snapshot);
            const errorTypeSummaryClassName = buildErrorTypeSummaryClassName();
            return (
              <motion.div variants={item} key={providerCard.id}>
                <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ProviderBadgeIcon providerHints={[providerCard.type, providerCard.id, providerCard.name]} size={32} />
                        <div>
                          <CardTitle className="text-lg">{providerCard.name}</CardTitle>
                          <CardDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                            <span>ID: {providerCard.id}</span>
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <Key className="h-3 w-3" />
                              <span>
                                {providerCard.availableKeys}
                                {" / "}
                                {providerCard.totalKeys}
                              </span>
                            </span>
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={providerStatusPresentation.badgeVariant} className="uppercase tracking-wider text-[10px]">
                        {providerCard.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 flex-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.successRate")}</p>
                        <p className="font-mono font-medium">{providerCard.successRate.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.errorRate")}</p>
                        <p className="font-mono font-medium">{providerCard.errorRate.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.inputTokens")}</p>
                        <p className="font-mono font-medium">{formatNumber(providerCard.inputTokens)}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.outputTokens")}</p>
                        <p className="font-mono font-medium">{formatNumber(providerCard.outputTokens)}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.cacheTokens")}</p>
                        <p className="font-mono font-medium">{formatNumber(providerCard.cacheTokens)}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">{translate("status.cacheHits")}</p>
                        <p className="font-mono font-medium">{formatNumber(providerCard.cacheHits)}</p>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/50 pt-4">
                      <p className="mb-2 text-xs text-muted-foreground">{translate("status.errorTypes")}</p>
                      {errorTypeSummaries.length === 0 ? (
                        <p className="font-mono text-sm text-muted-foreground">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {errorTypeSummaries.map(function renderErrorTypeSummary(summary) {
                            return (
                              <span
                                className={errorTypeSummaryClassName}
                                key={summary}
                              >
                                {summary}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
