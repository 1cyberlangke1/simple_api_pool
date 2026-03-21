import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "Login",
      component: () => import("@/views/LoginView.vue"),
      meta: { requiresAuth: false, transition: "ios-modal" },
    },
    {
      path: "/",
      component: () => import("@/views/LayoutView.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          name: "Dashboard",
          component: () => import("@/views/DashboardView.vue"),
        },
        {
          path: "playground",
          name: "Playground",
          component: () => import("@/views/PlaygroundView.vue"),
        },
        {
          path: "keys",
          name: "Keys",
          component: () => import("@/views/KeysView.vue"),
        },
        {
          path: "providers",
          name: "Providers",
          component: () => import("@/views/ProvidersView.vue"),
        },
        {
          path: "models",
          name: "Models",
          component: () => import("@/views/ModelsView.vue"),
        },
        {
          path: "groups",
          name: "Groups",
          component: () => import("@/views/GroupsView.vue"),
        },
        {
          path: "tools",
          name: "Tools",
          component: () => import("@/views/ToolsView.vue"),
        },
        {
          path: "config",
          name: "Config",
          component: () => import("@/views/ConfigView.vue"),
        },
        {
          path: "logs",
          name: "Logs",
          component: () => import("@/views/LogsView.vue"),
        },
        {
          path: "performance",
          name: "Performance",
          component: () => import("@/views/PerformanceView.vue"),
        },
      ],
    },
  ],
});

// 路由守卫
router.beforeEach((to, _from, next) => {
  // 直接从 localStorage 读取 token，避免 Pinia store 初始化顺序问题
  const token = localStorage.getItem("admin_token");
  const isAuthenticated = !!token;

  if (to.meta.requiresAuth !== false && !isAuthenticated) {
    next({ name: "Login", query: { redirect: to.fullPath } });
  } else if (to.name === "Login" && isAuthenticated) {
    next({ name: "Dashboard" });
  } else {
    next();
  }
});

export default router;