import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import * as React from "react";
import React__default, { createElement, useState, useEffect, useContext, createContext, forwardRef, useRef, useCallback, Suspense } from "react";
import { u as usePathname, g as getLayoutSegmentContext, a as useRouter, b as useParams, t as toRscUrl, c as getPrefetchedUrls, s as storePrefetchResponse, d as useSearchParams } from "../index.js";
import Hls, { Events, ErrorTypes, ErrorDetails } from "hls.js";
import { transformProps, transformSourceProps } from "@unpic/core";
import "../__vite_rsc_assets_manifest.js";
import "react-dom";
import "react-dom/server.edge";
import "node:async_hooks";
class ErrorBoundary extends React__default.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    if (error && typeof error === "object" && "digest" in error) {
      const digest = String(error.digest);
      if (digest === "NEXT_NOT_FOUND" || // legacy compat
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;") || digest.startsWith("NEXT_REDIRECT;")) {
        throw error;
      }
    }
    return { error };
  }
  reset = () => {
    this.setState({ error: null });
  };
  render() {
    if (this.state.error) {
      const FallbackComponent = this.props.fallback;
      return jsx(FallbackComponent, { error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}
class NotFoundBoundaryInner extends React__default.Component {
  constructor(props) {
    super(props);
    this.state = { notFound: false, previousPathname: props.pathname };
  }
  static getDerivedStateFromProps(props, state) {
    if (props.pathname !== state.previousPathname && state.notFound) {
      return { notFound: false, previousPathname: props.pathname };
    }
    return { notFound: state.notFound, previousPathname: props.pathname };
  }
  static getDerivedStateFromError(error) {
    if (error && typeof error === "object" && "digest" in error) {
      const digest = String(error.digest);
      if (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) {
        return { notFound: true };
      }
    }
    throw error;
  }
  render() {
    if (this.state.notFound) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
function NotFoundBoundary({ fallback, children }) {
  const pathname = usePathname();
  return jsx(NotFoundBoundaryInner, { pathname, fallback, children });
}
function LayoutSegmentProvider({ depth, children }) {
  const ctx = getLayoutSegmentContext();
  if (!ctx) {
    return children;
  }
  return createElement(ctx.Provider, { value: depth }, children);
}
const API_ROUTES = {
  login: "/api/auth/login",
  validate: "/api/auth/validate",
  logout: "/api/auth/logout",
  updatePassword: "/api/auth/update-password"
};
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    let isMounted = true;
    const validateToken = async () => {
      const token = localStorage.getItem("token");
      try {
        if (!token) {
          throw new Error("No token found");
        }
        const response = await fetch(API_ROUTES.validate, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ token })
        });
        if (!response.ok) {
          throw new Error("Invalid token");
        }
        const { user: validatedUser } = await response.json();
        if (isMounted) {
          setUser(validatedUser);
        }
      } catch (error) {
        if (isMounted) {
          localStorage.removeItem("token");
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };
    validateToken();
    return () => {
      isMounted = false;
    };
  }, []);
  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch(API_ROUTES.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }
      localStorage.setItem("token", data.token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        isAdmin: data.user.isAdmin,
        isActive: data.user.isActive,
        mustResetPassword: data.user.mustResetPassword ?? false,
        isGuest: false
      });
      return true;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  const loginAsGuest = () => {
    const guestUser = {
      id: "guest",
      email: "guest@cinemafred.com",
      username: "Guest",
      isAdmin: false,
      isActive: true,
      mustResetPassword: false,
      isGuest: true
    };
    setUser(guestUser);
    localStorage.setItem("isGuest", "true");
  };
  const updatePassword = async (newPassword) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Not authenticated");
    setIsLoading(true);
    try {
      const response = await fetch(API_ROUTES.updatePassword, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update password");
      }
      if (user) {
        setUser({ ...user, mustResetPassword: false });
      }
    } finally {
      setIsLoading(false);
    }
  };
  const logout = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await fetch(API_ROUTES.logout, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("isGuest");
      setUser(null);
      setIsLoading(false);
    }
  };
  if (!isInitialized) {
    return null;
  }
  return /* @__PURE__ */ jsx(AuthContext.Provider, { value: { login, loginAsGuest, logout, updatePassword, user, isLoading }, children });
}
const useAuth = () => useContext(AuthContext);
const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
const Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);
const createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef(
    ({ className, ...props }, ref) => createElement(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};
const ArrowLeft = createLucideIcon("ArrowLeft", [
  ["path", { d: "m12 19-7-7 7-7", key: "1l729n" }],
  ["path", { d: "M19 12H5", key: "x3x0zl" }]
]);
const Calendar = createLucideIcon("Calendar", [
  ["path", { d: "M8 2v4", key: "1cmpym" }],
  ["path", { d: "M16 2v4", key: "4m81vk" }],
  ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
  ["path", { d: "M3 10h18", key: "8toen8" }]
]);
const Captions = createLucideIcon("Captions", [
  ["rect", { width: "18", height: "14", x: "3", y: "5", rx: "2", ry: "2", key: "12ruh7" }],
  ["path", { d: "M7 15h4M15 15h2M7 11h2M13 11h4", key: "1ueiar" }]
]);
const ChevronDown = createLucideIcon("ChevronDown", [
  ["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]
]);
const ChevronRight = createLucideIcon("ChevronRight", [
  ["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]
]);
const ChevronUp = createLucideIcon("ChevronUp", [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]]);
const CircleAlert = createLucideIcon("CircleAlert", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "1pkeuh" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "4dfq90" }]
]);
const Clock = createLucideIcon("Clock", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["polyline", { points: "12 6 12 12 16 14", key: "68esgv" }]
]);
const Film = createLucideIcon("Film", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M7 3v18", key: "bbkbws" }],
  ["path", { d: "M3 7.5h4", key: "zfgn84" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "M3 16.5h4", key: "1230mu" }],
  ["path", { d: "M17 3v18", key: "in4fa5" }],
  ["path", { d: "M17 7.5h4", key: "myr1c1" }],
  ["path", { d: "M17 16.5h4", key: "go4c1d" }]
]);
const KeyRound = createLucideIcon("KeyRound", [
  [
    "path",
    {
      d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
      key: "1s6t7t"
    }
  ],
  ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor", key: "w0ekpg" }]
]);
const LoaderCircle = createLucideIcon("LoaderCircle", [
  ["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]
]);
const Lock = createLucideIcon("Lock", [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
]);
const LogOut = createLucideIcon("LogOut", [
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", key: "1uf3rs" }],
  ["polyline", { points: "16 17 21 12 16 7", key: "1gabdz" }],
  ["line", { x1: "21", x2: "9", y1: "12", y2: "12", key: "1uyos4" }]
]);
const MessageSquare = createLucideIcon("MessageSquare", [
  ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", key: "1lielz" }]
]);
const Pencil = createLucideIcon("Pencil", [
  [
    "path",
    {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      key: "1a8usu"
    }
  ],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }]
]);
const Play = createLucideIcon("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);
const Plus = createLucideIcon("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);
const Search = createLucideIcon("Search", [
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ["path", { d: "m21 21-4.3-4.3", key: "1qie3q" }]
]);
const Settings = createLucideIcon("Settings", [
  [
    "path",
    {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      key: "1qme2f"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
]);
const Star = createLucideIcon("Star", [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
]);
const Trash2 = createLucideIcon("Trash2", [
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", key: "4alrt4" }],
  ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", key: "v07s0e" }],
  ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
  ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }]
]);
const TriangleAlert = createLucideIcon("TriangleAlert", [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
]);
const Upload = createLucideIcon("Upload", [
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["polyline", { points: "17 8 12 3 7 8", key: "t8dd8p" }],
  ["line", { x1: "12", x2: "12", y1: "3", y2: "15", key: "widbto" }]
]);
const UserPlus = createLucideIcon("UserPlus", [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["line", { x1: "19", x2: "19", y1: "8", y2: "14", key: "1bvyxn" }],
  ["line", { x1: "22", x2: "16", y1: "11", y2: "11", key: "1shjgl" }]
]);
const User = createLucideIcon("User", [
  ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", key: "975kel" }],
  ["circle", { cx: "12", cy: "7", r: "4", key: "17ys0d" }]
]);
const X = createLucideIcon("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]);
const PasswordResetDialog = ({ onUpdatePassword, onClose }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    try {
      setIsLoading(true);
      await onUpdatePassword(newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50" }),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-50", children: /* @__PURE__ */ jsxs("div", { className: "bg-gray-900 rounded-lg p-6 w-full max-w-md relative", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "absolute top-4 right-4 text-gray-400 hover:text-white",
          children: /* @__PURE__ */ jsx(X, { className: "h-5 w-5" })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
        /* @__PURE__ */ jsx(KeyRound, { className: "h-6 w-6 text-blue-500" }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-white", children: "Reset Password" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-gray-400 mb-6", children: "You need to set a new password before continuing." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "newPassword", className: "block text-sm font-medium text-gray-300 mb-1", children: "New Password" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              id: "newPassword",
              type: "password",
              value: newPassword,
              onChange: (e) => setNewPassword(e.target.value),
              className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              required: true,
              minLength: 8
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "confirmPassword", className: "block text-sm font-medium text-gray-300 mb-1", children: "Confirm Password" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              id: "confirmPassword",
              type: "password",
              value: confirmPassword,
              onChange: (e) => setConfirmPassword(e.target.value),
              className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              required: true,
              minLength: 8
            }
          )
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "text-red-500 text-sm bg-red-900/20 p-2 rounded", children: error }),
        /* @__PURE__ */ jsx("div", { className: "flex gap-3 pt-2", children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: isLoading,
            className: "flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 \n                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500\n                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            children: isLoading ? /* @__PURE__ */ jsxs("span", { className: "flex items-center justify-center gap-2", children: [
              /* @__PURE__ */ jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
              "Updating..."
            ] }) : "Update Password"
          }
        ) })
      ] })
    ] }) })
  ] });
};
function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { login, loginAsGuest, updatePassword, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user && !user.mustResetPassword) {
      router.push("/");
    }
  }, [user, router]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const success = await login(username, password);
      if (success) {
      } else {
        setError("Invalid credentials");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err instanceof Error) {
        if (err.message === "Invalid credentials" || err.message.includes("Invalid credentials")) {
          setError("Invalid credentials");
        } else if (err.message === "Account is inactive") {
          setError("Account is inactive");
        } else {
          setError("An unexpected error occurred.");
        }
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };
  const handlePasswordReset = async (newPassword) => {
    try {
      await updatePassword(newPassword);
      router.push("/");
    } catch (error2) {
      throw error2;
    }
  };
  useEffect(() => {
    if (user?.mustResetPassword) {
      setShowResetDialog(true);
    }
  }, [user]);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-gray-900 via-black to-gray-900", children: [
    /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md space-y-8 relative z-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsx(Film, { className: "h-16 w-16 text-blue-500" }) }),
        /* @__PURE__ */ jsx("h2", { className: "mt-8 text-3xl font-verdana text-white", children: "CinemaFred" }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm text-gray-400", children: "Authorized access only" })
      ] }),
      /* @__PURE__ */ jsxs("form", { className: "mt-8 space-y-6", onSubmit: handleSubmit, children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-md shadow-sm space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(User, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                required: true,
                value: username,
                onChange: (e) => setUsername(e.target.value),
                className: "appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50 \n                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                placeholder: "Username"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "password",
                required: true,
                value: password,
                onChange: (e) => setPassword(e.target.value),
                className: "appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50\n                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                placeholder: "Password"
              }
            )
          ] })
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg", children: error }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: isLoading,
            className: "group relative w-full flex justify-center py-3 px-4 border border-transparent\n                     text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700\n                     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500\n                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            children: isLoading ? "Verifying..." : "Sign in"
          }
        )
      ] })
    ] }),
    showResetDialog && /* @__PURE__ */ jsx(
      PasswordResetDialog,
      {
        onUpdatePassword: handlePasswordReset,
        onClose: () => setShowResetDialog(false)
      }
    )
  ] });
}
class HLSManager {
  constructor(config) {
    this.hls = null;
    this.failedSegmentRanges = /* @__PURE__ */ new Map();
    this.maxRetries = 3;
    this.retryCount = 0;
    this.playbackMonitorInterval = null;
    this.lastPlaybackTime = -1;
    this.currentStats = { loadedBytes: 0, totalBytes: 0, currentLevel: -1 };
    this.segmentSkipTimer = null;
    this.hlsLoadingStopped = false;
    this.config = config;
  }
  initialize() {
    const video = this.config.videoRef.current;
    if (!video) return false;
    if (Hls.isSupported()) {
      this.initializeHLS();
      return true;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      this.initializeNativeHLS();
      return true;
    }
    return false;
  }
  initializeHLS() {
    const video = this.config.videoRef.current;
    if (!video) return;
    const hlsConfig = {
      debug: false,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1e3 * 1e3,
      maxBufferHole: 0.5,
      // Let hls.js retry a few times before we mark it as failed
      fragLoadingMaxRetry: 2,
      fragLoadingMaxRetryTimeout: 4e3,
      fragLoadingRetryDelay: 500,
      fragLoadingTimeOut: 8e3
      // No custom loader - use default HLS.js loader
    };
    this.hls = new Hls(hlsConfig);
    this.setupEventListeners();
    this.loadStream();
  }
  initializeNativeHLS() {
    const video = this.config.videoRef.current;
    if (!video) return;
    const hlsUrl = this.config.getAuthenticatedUrl(true);
    console.log("Using native HLS support:", hlsUrl);
    video.src = hlsUrl;
  }
  setupEventListeners() {
    if (!this.hls) return;
    this.hls.on(Events.MANIFEST_PARSED, this.handleManifestParsed.bind(this));
    this.hls.on(Events.LEVEL_SWITCHED, this.handleLevelSwitched.bind(this));
    this.hls.on(Events.FRAG_LOADED, this.handleFragLoaded.bind(this));
    this.hls.on(Events.ERROR, this.handleError.bind(this));
    this.setupPlaybackMonitoring();
  }
  setupPlaybackMonitoring() {
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
    }
    this.playbackMonitorInterval = setInterval(() => {
      this.monitorPlaybackStall();
    }, 500);
  }
  monitorPlaybackStall() {
    const video = this.config.videoRef.current;
    if (!video || !this.hls || video.paused || video.seeking) {
      if (video) this.lastPlaybackTime = video.currentTime;
      return;
    }
    const currentTime = video.currentTime;
    const isStalled = currentTime === this.lastPlaybackTime;
    if (isStalled) {
      for (const [, range] of this.failedSegmentRanges.entries()) {
        if (currentTime >= range.start - 0.5 && currentTime <= range.end) {
          const jumpTo = range.end + 0.1;
          console.log(`🚨 Playback stalled in bad segment range (${range.start.toFixed(2)}s). Jumping to ${jumpTo.toFixed(2)}s.`);
          video.currentTime = jumpTo;
          break;
        }
      }
    }
    this.lastPlaybackTime = currentTime;
  }
  handleManifestParsed(event, data) {
    console.log("HLS manifest parsed, found", data.levels.length, "quality levels");
    const qualities = data.levels.map((level, index) => ({
      index,
      label: level.height ? `${level.height}p (${Math.round(level.bitrate / 1e3)}k)` : `${Math.round(level.bitrate / 1e3)}k`,
      height: level.height || 0,
      bitrate: Math.round(level.bitrate / 1e3)
    }));
    qualities.sort((a, b) => b.height - a.height);
    this.config.onQualitiesUpdate(["auto", ...qualities.map((q) => q.label)]);
    this.retryCount = 0;
  }
  handleLevelSwitched(event, data) {
    if (!this.hls) return;
    this.currentStats.currentLevel = data.level;
    this.config.onStatsUpdate({ ...this.currentStats });
  }
  handleFragLoaded(event, data) {
    this.currentStats.loadedBytes += data.frag.byteLength || 0;
    this.config.onStatsUpdate({ ...this.currentStats });
  }
  handleError(event, data) {
    console.log("HLS Error:", data);
    const isParsingError = data.type === ErrorTypes.MEDIA_ERROR && data.details === ErrorDetails.FRAG_PARSING_ERROR;
    const isNetworkError = data.type === ErrorTypes.NETWORK_ERROR && (data.details === ErrorDetails.FRAG_LOAD_ERROR || data.details === ErrorDetails.FRAG_LOAD_TIMEOUT);
    if ((isParsingError || isNetworkError && data.fatal) && data.frag) {
      const frag = data.frag;
      const segmentUrl = frag.url;
      if (!this.failedSegmentRanges.has(segmentUrl)) {
        const startTime = frag.start;
        const endTime = startTime + frag.duration;
        console.log(`🚫 Blacklisting segment ${frag.sn} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s) due to ${data.details}.`);
        this.failedSegmentRanges.set(segmentUrl, { start: startTime, end: endTime });
        if (this.hls && !this.hlsLoadingStopped) {
          console.log("🛑 Stopping HLS loading to prevent request storms");
          this.hlsLoadingStopped = true;
          this.hls.stopLoad();
          this.startSegmentSkipTimer();
        }
      }
    } else if (data.fatal) {
      this.handleGenericFatalError(data);
    }
  }
  handleGenericFatalError(data) {
    if (!this.hls) return;
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      switch (data.type) {
        case ErrorTypes.NETWORK_ERROR:
          this.hls.startLoad();
          break;
        case ErrorTypes.MEDIA_ERROR:
          this.hls.recoverMediaError();
          break;
      }
    } else {
      this.config.onError(`Failed to recover from ${data.type} after ${this.maxRetries} attempts.`);
    }
  }
  loadStream() {
    if (!this.hls) return;
    const video = this.config.videoRef.current;
    if (!video) return;
    const hlsUrl = this.config.getAuthenticatedUrl(true);
    console.log("Loading HLS stream:", hlsUrl);
    this.hls.loadSource(hlsUrl);
    this.hls.attachMedia(video);
  }
  setQuality(quality) {
    if (!this.hls) return;
    if (quality === "auto") {
      this.hls.currentLevel = -1;
    } else {
      const qualityIndex = this.hls.levels.findIndex((level) => {
        const label = level.height ? `${level.height}p (${Math.round(level.bitrate / 1e3)}k)` : `${Math.round(level.bitrate / 1e3)}k`;
        return label === quality;
      });
      if (qualityIndex >= 0) {
        this.hls.currentLevel = qualityIndex;
      }
    }
  }
  retry() {
    this.retryCount = 0;
    this.failedSegmentRanges.clear();
    this.hlsLoadingStopped = false;
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
      this.segmentSkipTimer = null;
    }
    if (this.hls) {
      this.hls.destroy();
    }
    this.initialize();
  }
  startSegmentSkipTimer() {
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
    }
    console.log("⏰ [Step 4] Starting background timer - checking distance every second");
    this.segmentSkipTimer = setInterval(() => {
      this.checkDistanceToFailedSegments();
    }, 1e3);
  }
  checkDistanceToFailedSegments() {
    const video = this.config.videoRef.current;
    if (!video || !this.hls || this.failedSegmentRanges.size === 0) {
      return;
    }
    const currentTime = video.currentTime;
    console.log(`⏰ [Step 2] Current timestamp: ${currentTime.toFixed(2)}s`);
    for (const [segmentUrl, range] of this.failedSegmentRanges.entries()) {
      console.log(`📍 [Step 3] Broken segment starts at: ${range.start.toFixed(2)}s`);
      const distanceToSegment = range.start - currentTime;
      console.log(`📏 [Step 5] Distance calculation: ${distanceToSegment.toFixed(1)}s away from bad segment`);
      if (distanceToSegment > 0 && distanceToSegment <= 5) {
        const jumpTo = range.end + 1;
        console.log(`⏭️ [Step 6] Approaching bad segment in ${distanceToSegment.toFixed(1)}s. Skipping from ${currentTime.toFixed(2)}s to ${jumpTo.toFixed(2)}s`);
        video.currentTime = jumpTo;
        if (this.hlsLoadingStopped) {
          console.log("🔄 [Step 6] Resuming HLS requests with startLoad()");
          this.hlsLoadingStopped = false;
          this.hls.startLoad();
        }
        if (this.segmentSkipTimer) {
          clearInterval(this.segmentSkipTimer);
          this.segmentSkipTimer = null;
        }
        break;
      }
    }
  }
  destroy() {
    if (this.playbackMonitorInterval) {
      clearInterval(this.playbackMonitorInterval);
      this.playbackMonitorInterval = null;
    }
    if (this.segmentSkipTimer) {
      clearInterval(this.segmentSkipTimer);
      this.segmentSkipTimer = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.failedSegmentRanges.clear();
    this.hlsLoadingStopped = false;
  }
  get instance() {
    return this.hls;
  }
}
const QualitySelector = ({
  availableQualities,
  currentQuality,
  onQualityChange,
  onClose
}) => {
  const handleQualitySelect = (quality) => {
    onQualityChange(quality);
    onClose();
  };
  return /* @__PURE__ */ jsx("div", { className: "absolute top-12 left-0 bg-black/90 backdrop-blur-sm rounded-lg \n                  border border-gray-600 min-w-[120px] z-60", children: /* @__PURE__ */ jsxs("div", { className: "p-2", children: [
    /* @__PURE__ */ jsx("div", { className: "text-white text-sm font-medium mb-2 px-2", children: "Quality" }),
    availableQualities.map((quality) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => handleQualitySelect(quality),
        className: `w-full text-left px-2 py-1 text-sm rounded transition-colors ${currentQuality === quality ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`,
        children: quality
      },
      quality
    ))
  ] }) });
};
const VideoControls = ({
  onBack,
  subtitlesUrl,
  captionsOn,
  onToggleCaptions,
  isHLSSupported,
  availableQualities,
  currentQuality,
  showQualityMenu,
  onToggleQualityMenu,
  onQualityChange
}) => {
  return /* @__PURE__ */ jsxs("div", { className: "absolute top-4 left-4 z-50 flex gap-4", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: onBack,
        className: "flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 \n                  text-white rounded-lg transition-colors backdrop-blur-sm",
        title: "Go back",
        children: /* @__PURE__ */ jsx(ArrowLeft, { className: "w-5 h-5" })
      }
    ),
    subtitlesUrl && /* @__PURE__ */ jsx(
      "button",
      {
        onClick: onToggleCaptions,
        className: `flex items-center justify-center w-10 h-10 rounded-lg transition-colors backdrop-blur-sm ${captionsOn ? "bg-blue-600/80 hover:bg-blue-700/80 text-white" : "bg-black/60 hover:bg-black/80 text-white"}`,
        title: captionsOn ? "Turn off subtitles" : "Turn on subtitles",
        children: /* @__PURE__ */ jsx(Captions, { className: "w-5 h-5" })
      }
    ),
    isHLSSupported && availableQualities.length > 1 && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onToggleQualityMenu,
          className: "flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 \n                      text-white rounded-lg transition-colors backdrop-blur-sm",
          title: "Quality settings",
          children: /* @__PURE__ */ jsx(Settings, { className: "w-5 h-5" })
        }
      ),
      showQualityMenu && /* @__PURE__ */ jsx(
        QualitySelector,
        {
          availableQualities,
          currentQuality,
          onQualityChange,
          onClose: () => onToggleQualityMenu()
        }
      )
    ] })
  ] });
};
const ErrorOverlay = ({
  error,
  onRetry,
  onFallbackToMP4,
  showMP4Fallback
}) => {
  return /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center bg-black/80", children: [
    /* @__PURE__ */ jsx("div", { className: "text-red-400 text-lg mb-4", children: "Video Error" }),
    /* @__PURE__ */ jsx("div", { className: "text-white text-sm text-center mb-4 max-w-md", children: error }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onRetry,
          className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors",
          children: "Retry"
        }
      ),
      showMP4Fallback && onFallbackToMP4 && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onFallbackToMP4,
          className: "px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors",
          children: "Use MP4"
        }
      )
    ] })
  ] });
};
const HLSStatsOverlay = ({
  stats,
  hlsInstance,
  videoRef,
  useHLS
}) => {
  const getQualityInfo = () => {
    if (stats.currentLevel >= 0 && hlsInstance?.levels) {
      const level = hlsInstance.levels[stats.currentLevel];
      return level ? `${level.height}p (${Math.round(level.bitrate / 1e3)}k)` : stats.currentLevel;
    }
    return "Auto";
  };
  const getBufferInfo = () => {
    const video = videoRef.current;
    if (!video) return "0s";
    const buffered = video.buffered;
    if (buffered.length > 0) {
      const bufferEnd = buffered.end(buffered.length - 1);
      const bufferSeconds = bufferEnd - video.currentTime;
      return `${bufferSeconds.toFixed(1)}s`;
    }
    return "0s";
  };
  return /* @__PURE__ */ jsxs("div", { className: "absolute top-4 right-4 z-50 bg-black/60 backdrop-blur-sm rounded-lg p-2 text-white text-xs max-w-xs", children: [
    /* @__PURE__ */ jsx("div", { className: "font-semibold mb-1", children: "📊 HLS Stats" }),
    /* @__PURE__ */ jsxs("div", { children: [
      "Quality: ",
      getQualityInfo()
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      "Loaded: ",
      (stats.loadedBytes / 1024 / 1024).toFixed(1),
      "MB"
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      "Levels: ",
      hlsInstance?.levels?.length || 0
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      "Buffer: ",
      getBufferInfo()
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      "Mode: ",
      useHLS ? "HLS" : "MP4"
    ] })
  ] });
};
const VideoPlayer = ({
  streamUrl,
  poster,
  title,
  movieId,
  subtitlesUrl,
  isAdmin = false,
  onClose,
  useHLS = true
}) => {
  const videoRef = useRef(null);
  const hlsManagerRef = useRef(null);
  const [state, setState] = useState({
    captionsOn: false,
    videoError: null,
    retryCount: 0,
    isHLSSupported: false,
    availableQualities: [],
    currentQuality: "auto",
    showQualityMenu: false,
    hlsStats: { loadedBytes: 0, totalBytes: 0, currentLevel: -1 }
  });
  const maxRetries = 3;
  const getAuthenticatedStreamUrl = useCallback((isHLS = false) => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.log("No authentication token found");
      return streamUrl;
    }
    console.log("Retrieved token from localStorage:", token.substring(0, 20) + "...");
    const baseUrl = isHLS ? `/api/hls/${movieId}` : streamUrl;
    const separator = baseUrl.includes("?") ? "&" : "?";
    const authenticatedUrl = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    console.log("Generated authenticated URL:", authenticatedUrl);
    return authenticatedUrl;
  }, [movieId, streamUrl]);
  const handleHLSError = useCallback((error) => {
    setState((prev) => ({ ...prev, videoError: error }));
  }, []);
  const handleHLSStatsUpdate = useCallback((stats) => {
    setState((prev) => ({
      ...prev,
      hlsStats: { ...prev.hlsStats, ...stats }
    }));
  }, []);
  const handleHLSQualitiesUpdate = useCallback((qualities) => {
    setState((prev) => ({
      ...prev,
      availableQualities: qualities,
      isHLSSupported: true
    }));
  }, []);
  const initializePlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (useHLS) {
      hlsManagerRef.current = new HLSManager({
        movieId,
        videoRef,
        onError: handleHLSError,
        onStatsUpdate: handleHLSStatsUpdate,
        onQualitiesUpdate: handleHLSQualitiesUpdate,
        getAuthenticatedUrl: getAuthenticatedStreamUrl
      });
      const hlsSupported = hlsManagerRef.current.initialize();
      if (!hlsSupported) {
        console.log("HLS not supported, falling back to MP4");
        initializeMP4();
      }
    } else {
      initializeMP4();
    }
  }, [useHLS, movieId, getAuthenticatedStreamUrl, handleHLSError, handleHLSStatsUpdate, handleHLSQualitiesUpdate]);
  const initializeMP4 = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setState((prev) => ({ ...prev, isHLSSupported: false }));
    const authenticatedUrl = getAuthenticatedStreamUrl(false);
    video.src = authenticatedUrl;
    console.log("Loading MP4 stream:", authenticatedUrl);
  }, [getAuthenticatedStreamUrl]);
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && video.currentTime > 0) {
      localStorage.setItem(`video-position-${movieId}`, video.currentTime.toString());
    }
  }, [movieId]);
  const handleLoadStart = useCallback(() => {
    setState((prev) => ({ ...prev, videoError: null }));
  }, []);
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    console.log(`Metadata loaded. Duration: ${video.duration.toFixed(2)}s`);
    const savedPosition = localStorage.getItem(`video-position-${movieId}`);
    if (savedPosition) {
      const position = parseFloat(savedPosition);
      if (position > 0 && position < video.duration) {
        console.log(`Restoring position: ${position.toFixed(2)}s`);
        video.currentTime = position;
      }
    }
  }, [movieId]);
  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (video?.error) {
      const errorCode = video.error.code;
      const errorMessage = video.error.message;
      console.log(`Video error: ${errorCode} - ${errorMessage}`);
      const errorTypes = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED"
      };
      const errorType = errorTypes[errorCode] || "UNKNOWN";
      setState((prev) => ({ ...prev, videoError: `${errorType}: ${errorMessage}` }));
    }
  }, []);
  const handleBack = useCallback(() => {
    if (videoRef.current) {
      localStorage.setItem(
        `video-position-${movieId}`,
        videoRef.current.currentTime.toString()
      );
    }
    if (onClose) {
      onClose();
    } else {
      window.location.href = `/movie/${movieId}`;
    }
  }, [movieId, onClose]);
  const handleToggleCaptions = useCallback(() => {
    setState((prev) => ({ ...prev, captionsOn: !prev.captionsOn }));
    const track = videoRef.current?.textTracks[0];
    if (track) {
      track.mode = !state.captionsOn ? "showing" : "hidden";
    }
  }, [state.captionsOn]);
  const handleToggleQualityMenu = useCallback(() => {
    setState((prev) => ({ ...prev, showQualityMenu: !prev.showQualityMenu }));
  }, []);
  const handleQualityChange = useCallback((quality) => {
    if (hlsManagerRef.current) {
      hlsManagerRef.current.setQuality(quality);
    }
    setState((prev) => ({
      ...prev,
      currentQuality: quality,
      showQualityMenu: false
    }));
  }, []);
  const handleRetry = useCallback(() => {
    if (state.retryCount >= maxRetries) {
      setState((prev) => ({ ...prev, videoError: "Failed to load video after multiple attempts" }));
      return;
    }
    console.log(`Retrying video load (attempt ${state.retryCount + 1}/${maxRetries})`);
    setState((prev) => ({
      ...prev,
      retryCount: prev.retryCount + 1,
      videoError: null
    }));
    if (hlsManagerRef.current) {
      hlsManagerRef.current.destroy();
      hlsManagerRef.current = null;
    }
    initializePlayer();
  }, [state.retryCount, maxRetries, initializePlayer]);
  const handleFallbackToMP4 = useCallback(() => {
    setState((prev) => ({ ...prev, videoError: null, retryCount: 0 }));
    if (hlsManagerRef.current) {
      hlsManagerRef.current.destroy();
      hlsManagerRef.current = null;
    }
    initializeMP4();
  }, [initializeMP4]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const events = [
      ["loadstart", handleLoadStart],
      ["timeupdate", handleTimeUpdate],
      ["error", handleVideoError],
      ["loadedmetadata", handleLoadedMetadata]
    ];
    events.forEach(([event, handler]) => video.addEventListener(event, handler));
    initializePlayer();
    console.log(`Player initialized: ${movieId}`);
    console.log(`Stream: ${streamUrl}`);
    console.log(`HLS enabled: ${useHLS}`);
    subtitlesUrl && console.log("Subtitles available");
    return () => {
      events.forEach(([event, handler]) => video.removeEventListener(event, handler));
      if (hlsManagerRef.current) {
        hlsManagerRef.current.destroy();
        hlsManagerRef.current = null;
      }
      console.log("Player unmounted");
    };
  }, [movieId, streamUrl, subtitlesUrl, useHLS, initializePlayer, handleLoadStart, handleTimeUpdate, handleVideoError, handleLoadedMetadata]);
  return /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 bg-black flex flex-col", children: [
    /* @__PURE__ */ jsx(
      VideoControls,
      {
        onBack: handleBack,
        subtitlesUrl,
        captionsOn: state.captionsOn,
        onToggleCaptions: handleToggleCaptions,
        isHLSSupported: state.isHLSSupported,
        availableQualities: state.availableQualities,
        currentQuality: state.currentQuality,
        showQualityMenu: state.showQualityMenu,
        onToggleQualityMenu: handleToggleQualityMenu,
        onQualityChange: handleQualityChange
      }
    ),
    isAdmin && state.isHLSSupported && hlsManagerRef.current?.instance && /* @__PURE__ */ jsx(
      HLSStatsOverlay,
      {
        stats: state.hlsStats,
        hlsInstance: hlsManagerRef.current.instance,
        videoRef,
        useHLS
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 relative bg-slate-900", children: [
      /* @__PURE__ */ jsx(
        "video",
        {
          ref: videoRef,
          className: "absolute inset-0 w-full h-full",
          controls: true,
          poster,
          preload: "auto",
          controlsList: "nodownload",
          crossOrigin: "anonymous",
          style: {
            backgroundColor: "transparent",
            objectFit: "contain",
            objectPosition: "center"
          },
          children: subtitlesUrl && /* @__PURE__ */ jsx(
            "track",
            {
              kind: "subtitles",
              src: subtitlesUrl,
              srcLang: "en",
              label: "English",
              default: state.captionsOn
            }
          )
        }
      ),
      state.videoError && /* @__PURE__ */ jsx(
        ErrorOverlay,
        {
          error: state.videoError,
          onRetry: handleRetry,
          onFallbackToMP4: useHLS ? handleFallbackToMP4 : void 0,
          showMP4Fallback: useHLS
        }
      )
    ] })
  ] });
};
function MoviePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [movie, setMovie] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const movieId = params.id;
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    fetchMovieDetails();
  }, [movieId, user, authLoading]);
  const fetchMovieDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/movies/${movieId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch movie details");
      }
      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError("Error loading movie. Please try again.");
      console.error("Error fetching movie details:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleClose = () => {
    router.push("/");
  };
  if (authLoading || isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-white" }) });
  }
  if (error || !movie) {
    return /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 bg-black flex flex-col items-center justify-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-red-400 mb-4", children: error || "Movie not found" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => router.push("/"),
          className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors",
          children: "Back to Home"
        }
      )
    ] });
  }
  const subtitlesUrl = movie.r2_subtitles_path ? `/api/movie/${movie.r2_subtitles_path}` : void 0;
  const useHLS = Boolean(movie.hls_ready && movie.r2_hls_path);
  const streamUrl = useHLS ? `/api/hls/${movieId}` : `/api/stream/${movieId}`;
  return /* @__PURE__ */ jsx(
    VideoPlayer,
    {
      streamUrl,
      poster: movie.r2_image_path ? `/api/movie/${movie.r2_image_path}` : void 0,
      title: movie.title,
      movieId,
      subtitlesUrl,
      isAdmin: user?.isAdmin,
      onClose: handleClose,
      useHLS
    }
  );
}
const CreateUserDialog = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }
      setCredentials({
        username: data.username,
        tempPassword: data.tempPassword
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsLoading(false);
    }
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50", onClick: onClose }),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-50", children: /* @__PURE__ */ jsxs("div", { className: "bg-gray-900 rounded-lg p-6 w-full max-w-md relative", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "absolute right-4 top-4 text-gray-400 hover:text-white transition-colors",
          children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" })
        }
      ),
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-white mb-4", children: "Create New User" }),
      credentials ? /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-blue-900/50 p-4 rounded-lg", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-medium text-white mb-2", children: "Temporary Credentials" }),
          /* @__PURE__ */ jsxs("p", { className: "text-gray-300", children: [
            "Username: ",
            /* @__PURE__ */ jsx("span", { className: "font-mono", children: credentials.username })
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-gray-300", children: [
            "Password: ",
            /* @__PURE__ */ jsx("span", { className: "font-mono", children: credentials.tempPassword })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: "The user will be required to change these credentials on first login." }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: onClose,
            className: "w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 transition-colors",
            children: "Close"
          }
        )
      ] }) : /* @__PURE__ */ jsxs("form", { onSubmit: handleCreateUser, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "email", className: "block text-sm font-medium text-gray-300 mb-1", children: "Email Address" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "email",
              id: "email",
              value: email,
              onChange: (e) => setEmail(e.target.value),
              className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white\n                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              required: true
            }
          )
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "text-red-500 text-sm bg-red-900/20 p-2 rounded", children: error }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: isLoading,
            className: "w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 \n                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500\n                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            children: isLoading ? /* @__PURE__ */ jsxs("span", { className: "flex items-center justify-center gap-2", children: [
              /* @__PURE__ */ jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
              "Creating..."
            ] }) : "Create User"
          }
        )
      ] })
    ] }) })
  ] });
};
const CreateMovieForm = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    title: "",
    year: (/* @__PURE__ */ new Date()).getFullYear(),
    director: "",
    genre: [],
    description: "",
    genreInput: ""
    // Initialize the input value
  });
  const [files, setFiles] = useState({
    video: null,
    image: null,
    subtitles: null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const resetForm = () => {
    setFormData({
      title: "",
      year: (/* @__PURE__ */ new Date()).getFullYear(),
      director: "",
      genre: [],
      description: "",
      genreInput: ""
    });
    setFiles({
      video: null,
      image: null,
      subtitles: null
    });
    setError(null);
    setUploadProgress({});
  };
  const handleClose = () => {
    resetForm();
    onClose();
  };
  const handleFileChange = (type) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFiles((prev) => ({ ...prev, [type]: file }));
    if (type === "video") {
      try {
        setIsSubmitting(true);
        setError(null);
        console.log("Processing video file:", file.name);
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (!extension || !["mp4", "mkv", "avi"].includes(extension)) {
          throw new Error("Invalid file extension. Expected: mp4, mkv, or avi");
        }
        console.log("Sending filename to TMDB service for parsing:", file.name);
        const queryParams = new URLSearchParams({
          filename: file.name
        });
        console.log("Sending filename to API:", file.name);
        const response = await fetch(`/api/movies/metadata?${queryParams.toString()}`, {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          }
        });
        const data = await response.json();
        console.log("Metadata response:", data);
        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch movie metadata");
        }
        if (!data.metadata) {
          throw new Error("No metadata found for this movie");
        }
        setFormData((prev) => ({
          ...prev,
          title: data.metadata.title,
          year: data.metadata.year,
          director: data.metadata.director,
          genre: data.metadata.genre,
          genreInput: data.metadata.genre.join(", "),
          // Add this line
          description: data.metadata.description,
          duration: data.metadata.duration
        }));
        if (data.metadata.posterUrl) {
          try {
            console.log("Downloading poster from:", data.metadata.posterUrl);
            setUploadProgress((prev) => ({
              ...prev,
              poster: 0
            }));
            const posterResponse = await fetch("/api/movies/poster", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
              },
              body: JSON.stringify({
                imageUrl: data.metadata.posterUrl
              })
            });
            if (!posterResponse.ok) {
              const errorData = await posterResponse.json();
              throw new Error(errorData.error || "Failed to download poster");
            }
            const posterData = await posterResponse.json();
            console.log("Poster download response:", posterData);
            if (!posterData.path) {
              throw new Error("No poster path received from server");
            }
            setUploadProgress((prev) => ({
              ...prev,
              poster: 50
            }));
            const posterRequest = await fetch(`/${posterData.path}`);
            if (!posterRequest.ok) {
              throw new Error("Failed to fetch downloaded poster");
            }
            const posterBlob = await posterRequest.blob();
            console.log("Poster blob received:", posterBlob.size, "bytes");
            const posterFile = new File(
              [posterBlob],
              posterData.path.split("/").pop() || "poster.jpg",
              { type: "image/jpeg" }
            );
            setFormData((prev) => ({
              ...prev,
              r2_image_path: posterData.path
            }));
            setFiles((prev) => ({
              ...prev,
              image: posterFile
            }));
            setUploadProgress((prev) => ({
              ...prev,
              poster: 100
            }));
            console.log("Poster process completed successfully");
          } catch (posterError) {
            console.error("Error in poster download process:", posterError);
            setError("Failed to download poster. Please upload one manually.");
          }
        } else {
          console.log("No poster URL available in metadata");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to auto-detect movie information";
        setError(errorMessage);
        console.error("Error in handleFileChange:", err);
        setUploadProgress({});
        setFormData({
          title: "",
          year: (/* @__PURE__ */ new Date()).getFullYear(),
          director: "",
          genre: [],
          description: "",
          genreInput: ""
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };
  const handleGenreChange = (e) => {
    const input = e.target.value;
    const genres = input.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
    setFormData((prev) => ({
      ...prev,
      genre: genres,
      genreInput: input
    }));
  };
  const uploadFile = async (file, type) => {
    try {
      const presignedResponse = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          filename: file.name,
          type,
          contentType: file.type || "application/x-subrip"
          // Add fallback for SRT files
        })
      });
      const data = await presignedResponse.json();
      if (!presignedResponse.ok) {
        throw new Error(data.error || `Failed to get upload URL for ${type}`);
      }
      const { presignedUrl, filename, organizedPath } = data;
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignedUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/x-subrip");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round(event.loaded / event.total * 100);
            setUploadProgress((prev) => ({
              ...prev,
              [type]: progress
            }));
          }
        };
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(organizedPath);
          } else {
            reject(new Error(`Failed to upload ${type}, status code: ${xhr.status}`));
          }
        };
        xhr.onerror = () => {
          reject(new Error(`Upload error for ${type}`));
        };
        xhr.send(file);
      });
    } catch (error2) {
      console.error(`Upload error for ${type}:`, error2);
      throw error2;
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (!files.video || !files.image) {
        throw new Error("Video and image files are required");
      }
      const [videoPath, imagePath, subtitlesPath] = await Promise.all([
        uploadFile(files.video, "video"),
        uploadFile(files.image, "image"),
        files.subtitles ? uploadFile(files.subtitles, "subtitles") : Promise.resolve(null)
      ]);
      const response = await fetch("/api/movies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          ...formData,
          r2_video_path: videoPath,
          r2_image_path: imagePath,
          r2_subtitles_path: subtitlesPath
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create movie");
      }
      console.log("Movie created successfully:", result.message);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create movie");
    } finally {
      setIsSubmitting(false);
    }
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50", onClick: handleClose }),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-50", children: /* @__PURE__ */ jsxs("div", { className: "bg-gray-900 rounded-lg p-6 w-full max-w-2xl", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-white mb-6", children: "Add New Movie" }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Movie File (MP4)" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: "video/mp4",
                  onChange: handleFileChange("video"),
                  className: "hidden",
                  id: "video-upload",
                  required: true
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "video-upload", className: "cursor-pointer text-center", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto h-8 w-8 text-gray-500 mb-2" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.video ? files.video.name : "Upload Video" })
              ] })
            ] }),
            uploadProgress["video"] !== void 0 && /* @__PURE__ */ jsxs("div", { className: "mt-2", children: [
              /* @__PURE__ */ jsx("div", { className: "h-2 bg-gray-800 rounded", children: /* @__PURE__ */ jsx(
                "div",
                {
                  className: "h-full bg-blue-600 rounded",
                  style: { width: `${uploadProgress["video"]}%` }
                }
              ) }),
              /* @__PURE__ */ jsxs("p", { className: "text-sm text-gray-500 mt-1", children: [
                uploadProgress["video"],
                "% uploaded"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Poster Image" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: "image/*",
                  onChange: handleFileChange("image"),
                  className: "hidden",
                  id: "image-upload"
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "image-upload", className: "cursor-pointer text-center", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto h-8 w-8 text-gray-500 mb-2" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.image ? files.image.name : "Upload Image" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Subtitles (Optional)" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".srt,.vtt",
                  onChange: handleFileChange("subtitles"),
                  className: "hidden",
                  id: "subtitles-upload"
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "subtitles-upload", className: "cursor-pointer text-center", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto h-8 w-8 text-gray-500 mb-2" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.subtitles ? files.subtitles.name : "Upload Subtitles" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "title", className: "block text-sm font-medium text-gray-300", children: "Title" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                id: "title",
                value: formData.title,
                onChange: (e) => setFormData((prev) => ({ ...prev, title: e.target.value })),
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { htmlFor: "year", className: "block text-sm font-medium text-gray-300", children: "Year" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  id: "year",
                  value: formData.year,
                  onChange: (e) => setFormData((prev) => ({ ...prev, year: parseInt(e.target.value) })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { htmlFor: "director", className: "block text-sm font-medium text-gray-300", children: "Director" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  id: "director",
                  value: formData.director,
                  onChange: (e) => setFormData((prev) => ({ ...prev, director: e.target.value })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  required: true
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "genre", className: "block text-sm font-medium text-gray-300", children: "Genres (comma-separated)" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                id: "genre",
                value: formData.genreInput,
                onChange: handleGenreChange,
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                placeholder: "Action, Drama, Thriller",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "description", className: "block text-sm font-medium text-gray-300", children: "Description" }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                id: "description",
                value: formData.description,
                onChange: (e) => setFormData((prev) => ({ ...prev, description: e.target.value })),
                rows: 4,
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                required: true
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 text-blue-400 bg-blue-500/10 p-3 rounded-lg", children: [
          /* @__PURE__ */ jsx(CircleAlert, { className: "h-5 w-5 mt-0.5 flex-shrink-0" }),
          /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
            /* @__PURE__ */ jsx("p", { className: "font-medium", children: "Automatic HLS Conversion" }),
            /* @__PURE__ */ jsx("p", { className: "text-blue-300 mt-1", children: "After creating the movie, it will be automatically converted to HLS format for streaming. This process happens in the background and may take several hours depending on video length." })
          ] })
        ] }),
        error && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg", children: [
          /* @__PURE__ */ jsx(CircleAlert, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsx("span", { children: error })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: handleClose,
              className: "px-4 py-2 text-gray-400 hover:text-white transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: isSubmitting || !files.video || !files.image || !formData.title || !formData.director || formData.genre.length === 0 || !formData.description,
              className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 \n                          disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              children: isSubmitting ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
                "Creating..."
              ] }) : "Create Movie"
            }
          )
        ] })
      ] })
    ] }) })
  ] });
};
const AccountDialog = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/users/update-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ username })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update username");
      }
      setSuccess("Username updated successfully");
      setTimeout(onClose, 2e3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update username");
    } finally {
      setIsLoading(false);
    }
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50", onClick: onClose }),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-50", children: /* @__PURE__ */ jsxs("div", { className: "bg-gray-900 rounded-lg p-6 w-full max-w-md relative", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          className: "absolute right-4 top-4 text-gray-400 hover:text-white transition-colors",
          children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
        /* @__PURE__ */ jsx(User, { className: "h-6 w-6 text-blue-500" }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-white", children: "Account Settings" })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleUpdateUsername, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "username", className: "block text-sm font-medium text-gray-300 mb-1", children: "Username" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              id: "username",
              type: "text",
              value: username,
              onChange: (e) => setUsername(e.target.value),
              className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              required: true
            }
          )
        ] }),
        error && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg", children: [
          /* @__PURE__ */ jsx(CircleAlert, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsx("span", { children: error })
        ] }),
        success && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-green-500 bg-green-500/10 p-3 rounded-lg", children: [
          /* @__PURE__ */ jsx(CircleAlert, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsx("span", { children: success })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-3 pt-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "px-4 py-2 text-gray-400 hover:text-white transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: isLoading || username === user?.username,
              className: "flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg \n                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 \n                         focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed \n                         transition-colors",
              children: isLoading ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
                "Updating..."
              ] }) : "Update Username"
            }
          )
        ] })
      ] })
    ] }) })
  ] });
};
const DANGEROUS_SCHEME_RE = /^[\s\u200B\uFEFF]*(javascript|data|vbscript)\s*:/i;
function isDangerousScheme(url) {
  return DANGEROUS_SCHEME_RE.test(url);
}
const LinkStatusContext = createContext({ pending: false });
function resolveHref(href) {
  if (typeof href === "string")
    return href;
  let url = href.pathname ?? "/";
  if (href.query) {
    const params = new URLSearchParams(href.query);
    url += `?${params.toString()}`;
  }
  return url;
}
function withBasePath(path) {
  {
    return path;
  }
}
function isHashOnlyChange(href) {
  if (href.startsWith("#"))
    return true;
  try {
    const current = new URL(window.location.href);
    const next = new URL(href, window.location.href);
    return current.pathname === next.pathname && current.search === next.search && next.hash !== "";
  } catch {
    return false;
  }
}
function resolveRelativeHref(href) {
  if (typeof window === "undefined")
    return href;
  if (href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
    return href;
  }
  try {
    const resolved = new URL(href, window.location.href);
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return href;
  }
}
function scrollToHash(hash) {
  if (!hash || hash === "#") {
    window.scrollTo(0, 0);
    return;
  }
  const id = hash.slice(1);
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: "auto" });
  }
}
function prefetchUrl(href) {
  if (typeof window === "undefined")
    return;
  const fullHref = withBasePath(href);
  if (fullHref.startsWith("http://") || fullHref.startsWith("https://") || fullHref.startsWith("//"))
    return;
  const rscUrl = toRscUrl(fullHref);
  const prefetched = getPrefetchedUrls();
  if (prefetched.has(rscUrl))
    return;
  prefetched.add(rscUrl);
  const schedule = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 100));
  schedule(() => {
    const win = window;
    if (typeof win.__VINEXT_RSC_NAVIGATE__ === "function") {
      fetch(rscUrl, {
        headers: { Accept: "text/x-component" },
        credentials: "include",
        priority: "low",
        // @ts-expect-error — purpose is a valid fetch option in some browsers
        purpose: "prefetch"
      }).then((response) => {
        if (response.ok) {
          storePrefetchResponse(rscUrl, response);
        } else {
          prefetched.delete(rscUrl);
        }
      }).catch(() => {
        prefetched.delete(rscUrl);
      });
    } else if (win.__NEXT_DATA__?.__vinext?.pageModuleUrl) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = fullHref;
      link.as = "document";
      document.head.appendChild(link);
    }
  });
}
let sharedObserver = null;
const observerCallbacks = /* @__PURE__ */ new WeakMap();
function getSharedObserver() {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined")
    return null;
  if (sharedObserver)
    return sharedObserver;
  sharedObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const callback = observerCallbacks.get(entry.target);
        if (callback) {
          callback();
          sharedObserver?.unobserve(entry.target);
          observerCallbacks.delete(entry.target);
        }
      }
    }
  }, {
    // Start prefetching when the link is within 250px of the viewport.
    // This gives the browser a head start before the user scrolls to it.
    rootMargin: "250px"
  });
  return sharedObserver;
}
function getDefaultLocale() {
  if (typeof window !== "undefined") {
    return window.__VINEXT_DEFAULT_LOCALE__;
  }
  return globalThis.__VINEXT_DEFAULT_LOCALE__;
}
function applyLocaleToHref(href, locale) {
  if (locale === false) {
    return href;
  }
  if (locale === void 0) {
    return href;
  }
  const defaultLocale = getDefaultLocale();
  if (locale === defaultLocale) {
    return href;
  }
  if (href.startsWith(`/${locale}/`) || href === `/${locale}`) {
    return href;
  }
  return `/${locale}${href.startsWith("/") ? href : `/${href}`}`;
}
const Link = forwardRef(function Link2({ href, as, replace = false, prefetch: prefetchProp, scroll = true, children, onClick, onNavigate, ...rest }, forwardedRef) {
  const { locale, ...restWithoutLocale } = rest;
  const resolvedHref = as ?? resolveHref(href);
  const isDangerous = typeof resolvedHref === "string" && isDangerousScheme(resolvedHref);
  const localizedHref = applyLocaleToHref(isDangerous ? "/" : resolvedHref, locale);
  const fullHref = withBasePath(localizedHref);
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const internalRef = useRef(null);
  const shouldPrefetch = prefetchProp !== false && !isDangerous;
  const setRefs = useCallback((node) => {
    internalRef.current = node;
    if (typeof forwardedRef === "function")
      forwardedRef(node);
    else if (forwardedRef)
      forwardedRef.current = node;
  }, [forwardedRef]);
  useEffect(() => {
    if (!shouldPrefetch || typeof window === "undefined")
      return;
    const node = internalRef.current;
    if (!node)
      return;
    if (localizedHref.startsWith("http://") || localizedHref.startsWith("https://") || localizedHref.startsWith("//"))
      return;
    const observer = getSharedObserver();
    if (!observer)
      return;
    observerCallbacks.set(node, () => prefetchUrl(localizedHref));
    observer.observe(node);
    return () => {
      observer.unobserve(node);
      observerCallbacks.delete(node);
    };
  }, [shouldPrefetch, localizedHref]);
  const handleClick = async (e) => {
    if (onClick)
      onClick(e);
    if (e.defaultPrevented)
      return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    if (e.currentTarget.target && e.currentTarget.target !== "_self") {
      return;
    }
    if (resolvedHref.startsWith("http://") || resolvedHref.startsWith("https://") || resolvedHref.startsWith("//")) {
      return;
    }
    e.preventDefault();
    if (onNavigate) {
      try {
        const navUrl = new URL(resolvedHref, window.location.origin);
        let prevented = false;
        const navEvent = {
          url: navUrl,
          preventDefault() {
            prevented = true;
          },
          get defaultPrevented() {
            return prevented;
          }
        };
        onNavigate(navEvent);
        if (navEvent.defaultPrevented) {
          return;
        }
      } catch {
      }
    }
    if (!replace) {
      const state = window.history.state ?? {};
      window.history.replaceState({ ...state, __vinext_scrollX: window.scrollX, __vinext_scrollY: window.scrollY }, "");
    }
    const absoluteHref = resolveRelativeHref(resolvedHref);
    const absoluteFullHref = withBasePath(absoluteHref);
    if (typeof window !== "undefined" && isHashOnlyChange(absoluteFullHref)) {
      const hash2 = absoluteFullHref.includes("#") ? absoluteFullHref.slice(absoluteFullHref.indexOf("#")) : "";
      if (replace) {
        window.history.replaceState(null, "", absoluteFullHref);
      } else {
        window.history.pushState(null, "", absoluteFullHref);
      }
      if (scroll) {
        scrollToHash(hash2);
      }
      return;
    }
    const hashIdx = absoluteFullHref.indexOf("#");
    const hash = hashIdx !== -1 ? absoluteFullHref.slice(hashIdx) : "";
    const win = window;
    if (typeof win.__VINEXT_RSC_NAVIGATE__ === "function") {
      if (replace) {
        window.history.replaceState(null, "", absoluteFullHref);
      } else {
        window.history.pushState(null, "", absoluteFullHref);
      }
      setPending(true);
      try {
        await win.__VINEXT_RSC_NAVIGATE__(absoluteFullHref);
      } finally {
        if (mountedRef.current)
          setPending(false);
      }
    } else {
      try {
        const routerModule = await import("./router-DqcOXVuJ.js");
        const Router = routerModule.default;
        if (replace) {
          await Router.replace(absoluteHref, void 0, { scroll });
        } else {
          await Router.push(absoluteHref, void 0, { scroll });
        }
      } catch {
        if (replace) {
          window.history.replaceState({}, "", absoluteFullHref);
        } else {
          window.history.pushState({}, "", absoluteFullHref);
        }
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
    if (scroll) {
      if (hash) {
        scrollToHash(hash);
      } else {
        window.scrollTo(0, 0);
      }
    }
  };
  const { passHref: _p, ...anchorProps } = restWithoutLocale;
  const linkStatusValue = React__default.useMemo(() => ({ pending }), [pending]);
  if (isDangerous) {
    return jsx("a", { ...anchorProps, children });
  }
  return jsx(LinkStatusContext.Provider, { value: linkStatusValue, children: jsx("a", { ref: setRefs, href: fullHref, onClick: handleClick, ...anchorProps, children }) });
});
const Header = () => {
  const { user, logout } = useAuth();
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreateMovieOpen, setIsCreateMovieOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };
  return (
    // can include border-b border-gray-800 in className = 
    /* @__PURE__ */ jsx("header", { className: "py-4 px-16", children: /* @__PURE__ */ jsxs("div", { className: "max-w-[128rem] mx-auto flex items-center justify-between", children: [
      /* @__PURE__ */ jsx(
        Link,
        {
          href: "/",
          className: "text-xl font-bold text-white hover:text-blue-400 transition-colors",
          children: "CinemaFred"
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        user?.isAdmin ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setIsCreateMovieOpen(true),
              className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors",
              children: [
                /* @__PURE__ */ jsx(Film, { className: "w-4 h-4" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Add Movie" })
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setIsCreateUserOpen(true),
              className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors",
              children: [
                /* @__PURE__ */ jsx(UserPlus, { className: "w-4 h-4" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Create User" })
              ]
            }
          )
        ] }) : !user?.isGuest && !user?.isAdmin && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(Link, { href: "/ratings", className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors", children: [
            /* @__PURE__ */ jsx(Star, { className: "w-4 h-4" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Ratings" })
          ] }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setIsAccountOpen(true),
              className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors",
              children: [
                /* @__PURE__ */ jsx(User, { className: "w-4 h-4" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Account" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleLogout,
            className: "flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors",
            children: [
              /* @__PURE__ */ jsx(LogOut, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Log out" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        CreateUserDialog,
        {
          isOpen: isCreateUserOpen,
          onClose: () => setIsCreateUserOpen(false)
        }
      ),
      /* @__PURE__ */ jsx(
        CreateMovieForm,
        {
          isOpen: isCreateMovieOpen,
          onClose: () => setIsCreateMovieOpen(false)
        }
      ),
      /* @__PURE__ */ jsx(
        AccountDialog,
        {
          isOpen: isAccountOpen,
          onClose: () => setIsAccountOpen(false)
        }
      )
    ] }) })
  );
};
const MovieGridHeader = ({
  onGenreSelect,
  onSortChange,
  selectedGenre,
  selectedSort,
  searchQuery = "",
  onSearchChange
}) => {
  const genres = [
    "Drama",
    "Sci-fi",
    "Comedy",
    "Horror",
    "Documentary",
    "Romance",
    "Thriller",
    "Action",
    "Fantasy"
  ];
  const sortOptions = [
    { value: "title-asc", label: "Title: A-Z" },
    { value: "created-desc", label: "Recently Added" },
    { value: "rating-desc", label: "Rating: High-Low" },
    { value: "title-desc", label: "Title: Z-A" },
    { value: "rating-asc", label: "Rating: Low-High" },
    { value: "year-desc", label: "Year: New-Old" },
    { value: "year-asc", label: "Year: Old-New" }
  ];
  const handleGenreClick = (genre) => {
    onGenreSelect?.(genre);
  };
  const handleSortChange = (e) => {
    onSortChange?.(e.target.value);
  };
  return /* @__PURE__ */ jsx("div", { className: "py-2 px-16", children: /* @__PURE__ */ jsx("div", { className: "max-w-[128rem] mx-auto", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 overflow-x-auto flex-grow", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => handleGenreClick(null),
          className: `px-4 py-1.5 rounded-md transition-colors whitespace-nowrap ${selectedGenre === null ? "bg-gray-800 text-white" : "bg-gray-800/50 text-gray-300 hover:bg-gray-800/80"}`,
          children: "All"
        }
      ),
      genres.map((genre) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => handleGenreClick(genre),
          className: `px-4 py-1.5 rounded-md transition-colors whitespace-nowrap ${selectedGenre === genre ? "bg-gray-800 text-white" : "bg-gray-800/50 text-gray-300 hover:bg-gray-800/80"}`,
          children: genre
        },
        genre
      ))
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ml-6", children: /* @__PURE__ */ jsx(
      "select",
      {
        value: selectedSort,
        onChange: handleSortChange,
        className: "bg-gray-800/50 border border-gray-700 rounded-md px-4 py-1.5 text-white\n                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent\n                       hover:bg-gray-800/80 transition-colors min-w-[200px]",
        children: sortOptions.map((option) => /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value))
      }
    ) }),
    onSearchChange && /* @__PURE__ */ jsx("div", { className: "ml-6", children: /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: "Search movies...",
          value: searchQuery,
          onChange: (e) => onSearchChange(e.target.value),
          className: "w-64 pl-9 pr-4 py-1.5 bg-gray-800/30 border border-gray-700/50 rounded-md text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
        }
      )
    ] }) })
  ] }) }) });
};
var nestedKeys = /* @__PURE__ */ new Set(["style"]);
var isNewReact = "use" in React;
var fixedMap = {
  srcset: "srcSet",
  fetchpriority: isNewReact ? "fetchPriority" : "fetchpriority"
};
var camelize = (key) => {
  if (key.startsWith("data-") || key.startsWith("aria-")) {
    return key;
  }
  return fixedMap[key] || key.replace(/-./g, (suffix) => suffix[1].toUpperCase());
};
function camelizeProps(props) {
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      camelize(k),
      nestedKeys.has(k) && v && typeof v !== "string" ? camelizeProps(v) : v
    ])
  );
}
var Image$1 = React.forwardRef(
  function Image2(props, ref) {
    const camelizedProps = camelizeProps(
      transformProps(props)
    );
    return /* @__PURE__ */ jsx("img", { ...camelizedProps, ref });
  }
);
React.forwardRef(
  function Source2(props, ref) {
    const camelizedProps = camelizeProps(
      transformSourceProps(
        props
      )
    );
    return /* @__PURE__ */ jsx("source", { ...camelizedProps, ref });
  }
);
function globToRegex(pattern, separator) {
  let regexStr = "^";
  const doubleStar = separator === "." ? ".+" : ".*";
  const singleStar = separator === "." ? "[^.]+" : "[^/]+";
  const parts = pattern.split("**");
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      regexStr += doubleStar;
    }
    const subParts = parts[i].split("*");
    for (let j = 0; j < subParts.length; j++) {
      if (j > 0) {
        regexStr += singleStar;
      }
      regexStr += subParts[j].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  regexStr += "$";
  return new RegExp(regexStr);
}
function matchRemotePattern(pattern, url) {
  if (pattern.protocol !== void 0) {
    if (pattern.protocol.replace(/:$/, "") !== url.protocol.replace(/:$/, "")) {
      return false;
    }
  }
  if (pattern.port !== void 0) {
    if (pattern.port !== url.port) {
      return false;
    }
  }
  if (!globToRegex(pattern.hostname, ".").test(url.hostname)) {
    return false;
  }
  if (pattern.search !== void 0) {
    if (pattern.search !== url.search) {
      return false;
    }
  }
  const pathnamePattern = pattern.pathname ?? "**";
  if (!globToRegex(pathnamePattern, "/").test(url.pathname)) {
    return false;
  }
  return true;
}
function hasRemoteMatch(domains, remotePatterns, url) {
  return domains.some((domain) => url.hostname === domain) || remotePatterns.some((p) => matchRemotePattern(p, url));
}
const __imageRemotePatterns = (() => {
  try {
    return JSON.parse('[{"protocol":"https","hostname":"pub-f58c527a326541cc87548f3216502f10.r2.dev","pathname":"/cinemafred/**"}]');
  } catch {
    return [];
  }
})();
const __imageDomains = (() => {
  try {
    return JSON.parse("[]");
  } catch {
    return [];
  }
})();
const __hasImageConfig = __imageRemotePatterns.length > 0 || __imageDomains.length > 0;
const __imageDeviceSizes = (() => {
  try {
    return JSON.parse("[640,750,828,1080,1200,1920,2048,3840]");
  } catch {
    return [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
  }
})();
function validateRemoteUrl(src) {
  if (!__hasImageConfig) {
    return { allowed: true };
  }
  let url;
  try {
    url = new URL(src, "http://n");
  } catch {
    return { allowed: false, reason: `Invalid URL: ${src}` };
  }
  if (hasRemoteMatch(__imageDomains, __imageRemotePatterns, url)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Image URL "${src}" is not configured in images.remotePatterns or images.domains in next.config.js. See: https://nextjs.org/docs/messages/next-image-unconfigured-host`
  };
}
function sanitizeBlurDataURL(url) {
  if (!url.startsWith("data:image/"))
    return void 0;
  if (/[)(}{\\'"\n\r]/.test(url))
    return void 0;
  return url;
}
function isRemoteUrl(src) {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//");
}
const RESPONSIVE_WIDTHS = __imageDeviceSizes;
function imageOptimizationUrl(src, width, quality = 75) {
  return `/_vinext/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}
function generateSrcSet(src, originalWidth, quality = 75) {
  const widths = RESPONSIVE_WIDTHS.filter((w) => w <= originalWidth * 2);
  if (widths.length === 0)
    return `${imageOptimizationUrl(src, originalWidth, quality)} ${originalWidth}w`;
  return widths.map((w) => `${imageOptimizationUrl(src, w, quality)} ${w}w`).join(", ");
}
const Image = forwardRef(function Image22({ src: srcProp, alt, width, height, fill, priority, quality, placeholder, blurDataURL, loader, sizes, className, style, unoptimized: _unoptimized, overrideSrc: _overrideSrc, loading, ...rest }, ref) {
  const src = typeof srcProp === "string" ? srcProp : srcProp.src;
  const imgWidth = width ?? (typeof srcProp === "object" ? srcProp.width : void 0);
  const imgHeight = height ?? (typeof srcProp === "object" ? srcProp.height : void 0);
  const imgBlurDataURL = blurDataURL ?? (typeof srcProp === "object" ? srcProp.blurDataURL : void 0);
  if (loader) {
    const resolvedSrc = loader({ src, width: imgWidth ?? 0, quality: quality ?? 75 });
    return jsx("img", { ref, src: resolvedSrc, alt, width: fill ? void 0 : imgWidth, height: fill ? void 0 : imgHeight, loading: priority ? "eager" : loading ?? "lazy", decoding: "async", sizes, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style } : style, ...rest });
  }
  if (isRemoteUrl(src)) {
    const validation = validateRemoteUrl(src);
    if (!validation.allowed) {
      {
        console.error(`[next/image] ${validation.reason}`);
        return null;
      }
    }
    const sanitizedBlur = imgBlurDataURL ? sanitizeBlurDataURL(imgBlurDataURL) : void 0;
    const bg = placeholder === "blur" && sanitizedBlur ? `url(${sanitizedBlur})` : void 0;
    if (fill) {
      return jsx(Image$1, { src, alt, layout: "fullWidth", priority, sizes, className, background: bg });
    }
    if (imgWidth && imgHeight) {
      return jsx(Image$1, { src, alt, width: imgWidth, height: imgHeight, layout: "constrained", priority, sizes, className, background: bg });
    }
  }
  const imgQuality = quality ?? 75;
  const isSvg = src.endsWith(".svg");
  const skipOptimization = _unoptimized === true || isSvg && true;
  const srcSet = imgWidth && !fill && !skipOptimization ? generateSrcSet(src, imgWidth, imgQuality) : imgWidth && !fill ? RESPONSIVE_WIDTHS.filter((w) => w <= imgWidth * 2).map((w) => `${src} ${w}w`).join(", ") || `${src} ${imgWidth}w` : void 0;
  const optimizedSrc = skipOptimization ? src : imgWidth ? imageOptimizationUrl(src, imgWidth, imgQuality) : imageOptimizationUrl(src, RESPONSIVE_WIDTHS[0], imgQuality);
  const sanitizedLocalBlur = imgBlurDataURL ? sanitizeBlurDataURL(imgBlurDataURL) : void 0;
  const blurStyle = placeholder === "blur" && sanitizedLocalBlur ? {
    backgroundImage: `url(${sanitizedLocalBlur})`,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center"
  } : void 0;
  return jsx("img", { ref, src: optimizedSrc, alt, width: fill ? void 0 : imgWidth, height: fill ? void 0 : imgHeight, loading: priority ? "eager" : loading ?? "lazy", fetchPriority: priority ? "high" : void 0, decoding: "async", srcSet, sizes: sizes ?? (fill ? "100vw" : void 0), className, "data-nimg": fill ? "fill" : "1", style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...blurStyle, ...style } : { ...blurStyle, ...style }, ...rest });
});
const TMDBPosterSelector = ({
  isOpen,
  onClose,
  posters,
  onSelect,
  isLoading,
  selectedPosterUrl,
  onLoadMore,
  hasMorePosters
}) => {
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]",
        onClick: onClose
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-[60]", children: /* @__PURE__ */ jsxs(
      "div",
      {
        className: "bg-gray-900 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col",
        onClick: (e) => e.stopPropagation(),
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-6 border-b border-gray-800", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-xl font-semibold text-white", children: "Select a Poster from TMDB" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onClose,
                className: "text-gray-400 hover:text-white transition-colors",
                disabled: isLoading,
                children: /* @__PURE__ */ jsx(X, { className: "w-6 h-6" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto p-6 webkit-scrollbar", children: posters.length === 0 ? /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-gray-400", children: /* @__PURE__ */ jsx("p", { children: "No posters available" }) }) : /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4", children: posters.map((posterUrl, index) => /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => onSelect(posterUrl),
                disabled: isLoading,
                className: `relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all ${selectedPosterUrl === posterUrl ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-700 hover:border-blue-400"} ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-105"}`,
                children: [
                  /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: posterUrl,
                      alt: `Poster ${index + 1}`,
                      className: "w-full h-full object-cover",
                      loading: "lazy"
                    }
                  ),
                  selectedPosterUrl === posterUrl && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-blue-500/20 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium", children: "Selected" }) }),
                  isLoading && selectedPosterUrl === posterUrl && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-black/50 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 text-white animate-spin" }) })
                ]
              },
              index
            )) }),
            hasMorePosters && /* @__PURE__ */ jsx("div", { className: "flex justify-center pt-2", children: /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onLoadMore,
                disabled: isLoading,
                className: "flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                children: isLoading ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
                  "Loading..."
                ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4" }),
                  "Load 8 More Posters"
                ] })
              }
            ) })
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "p-6 border-t border-gray-800", children: /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              disabled: isLoading,
              className: "px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50",
              children: "Cancel"
            }
          ) })
        ]
      }
    ) }),
    /* @__PURE__ */ jsx("style", { jsx: true, children: `
        .webkit-scrollbar::-webkit-scrollbar {
          width: 12px;
        }

        .webkit-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.8);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 1);
        }
      ` })
  ] });
};
const defaultFormData = {
  title: "",
  year: (/* @__PURE__ */ new Date()).getFullYear(),
  director: "",
  genre: [],
  description: "",
  r2_video_path: "",
  r2_image_path: "",
  r2_subtitles_path: null
};
const EditMovieForm = ({ isOpen, onClose, movie }) => {
  console.log("Movie prop received:", movie);
  const [formData, setFormData] = useState(() => {
    const initialData = {
      ...defaultFormData,
      title: movie.title || defaultFormData.title,
      year: movie.year || defaultFormData.year,
      director: movie.director || defaultFormData.director,
      genre: Array.isArray(movie.genre) ? [...movie.genre] : defaultFormData.genre,
      description: movie.description || defaultFormData.description,
      r2_video_path: movie.r2_video_path || defaultFormData.r2_video_path,
      r2_image_path: movie.r2_image_path || defaultFormData.r2_image_path,
      r2_subtitles_path: movie.r2_subtitles_path || defaultFormData.r2_subtitles_path
    };
    console.log("Initial form data:", initialData);
    return initialData;
  });
  const [files, setFiles] = useState({
    video: null,
    image: null,
    subtitles: null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTMDBPosters, setShowTMDBPosters] = useState(false);
  const [tmdbPosters, setTmdbPosters] = useState([]);
  const [isLoadingPosters, setIsLoadingPosters] = useState(false);
  const [selectedPosterUrl, setSelectedPosterUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePosters, setHasMorePosters] = useState(true);
  useEffect(() => {
    setFormData({
      ...defaultFormData,
      title: movie.title || defaultFormData.title,
      year: movie.year || defaultFormData.year,
      director: movie.director || defaultFormData.director,
      genre: Array.isArray(movie.genre) ? [...movie.genre] : defaultFormData.genre,
      description: movie.description || defaultFormData.description,
      r2_video_path: movie.r2_video_path || defaultFormData.r2_video_path,
      r2_image_path: movie.r2_image_path || defaultFormData.r2_image_path,
      r2_subtitles_path: movie.r2_subtitles_path || defaultFormData.r2_subtitles_path
    });
  }, [movie]);
  const handleFileChange = (type) => (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles((prev) => ({ ...prev, [type]: file }));
    }
  };
  const handleGenreChange = (e) => {
    const genres = e.target.value.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
    setFormData((prev) => ({ ...prev, genre: genres }));
  };
  const uploadToR2 = async (file, type) => {
    try {
      const presignedResponse = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          filename: file.name,
          type,
          contentType: file.type || "application/x-subrip"
        })
      });
      if (!presignedResponse.ok) {
        const data = await presignedResponse.json();
        throw new Error(data.error || `Failed to get upload URL for ${type}`);
      }
      const { presignedUrl, filename, organizedPath } = await presignedResponse.json();
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/x-subrip"
        }
      });
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${type}`);
      }
      return organizedPath;
    } catch (error2) {
      console.error(`Upload error for ${type}:`, error2);
      throw error2;
    }
  };
  const fetchTMDBPosters = async (page = 1) => {
    setIsLoadingPosters(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        title: formData.title,
        year: formData.year.toString(),
        page: page.toString()
      });
      const response = await fetch(`/api/movies/metadata?${queryParams.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch TMDB data");
      }
      if (data.metadata?.posters && data.metadata.posters.length > 0) {
        if (page === 1) {
          setTmdbPosters(data.metadata.posters);
          setShowTMDBPosters(true);
          setCurrentPage(1);
        } else {
          setTmdbPosters((prev) => [...prev, ...data.metadata.posters]);
          setCurrentPage(page);
        }
        setHasMorePosters(data.metadata.posters.length === 8);
      } else {
        if (page === 1) {
          throw new Error("No posters found for this movie");
        } else {
          setHasMorePosters(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch TMDB posters");
    } finally {
      setIsLoadingPosters(false);
    }
  };
  const loadMorePosters = () => {
    fetchTMDBPosters(currentPage + 1);
  };
  const downloadTMDBPoster = async (posterUrl) => {
    try {
      setIsLoadingPosters(true);
      setError(null);
      const response = await fetch("/api/movies/poster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ imageUrl: posterUrl })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to download poster");
      }
      const posterData = await response.json();
      setFormData((prev) => ({ ...prev, r2_image_path: posterData.path }));
      setSelectedPosterUrl(posterUrl);
      setShowTMDBPosters(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download poster");
    } finally {
      setIsLoadingPosters(false);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const updates = { ...formData };
      if (files.video) {
        updates.r2_video_path = await uploadToR2(files.video, "video");
      }
      if (files.image) {
        updates.r2_image_path = await uploadToR2(files.image, "image");
      }
      if (files.subtitles) {
        updates.r2_subtitles_path = await uploadToR2(files.subtitles, "subtitles");
      }
      const response = await fetch(`/api/movies/${movie.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error("Failed to update movie");
      }
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update movie");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this movie? This action cannot be undone.")) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/movies/${movie.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (!response.ok) {
        throw new Error("Failed to delete movie");
      }
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete movie");
    } finally {
      setIsDeleting(false);
    }
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50", onClick: onClose }),
    /* @__PURE__ */ jsx("div", { className: "fixed inset-0 flex items-center justify-center p-4 z-50", children: /* @__PURE__ */ jsxs("div", { className: "bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-6 pb-4 flex-shrink-0", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-white", children: "Edit Movie" }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleDelete,
            className: "flex items-center gap-2 px-3 py-1.5 text-red-500 hover:text-red-400 transition-colors",
            disabled: isDeleting,
            children: [
              /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsx("span", { children: isDeleting ? "Deleting..." : "Delete Movie" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto px-6 pb-6 webkit-scrollbar", children: /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Movie File (MP4)" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: "video/mp4",
                  onChange: handleFileChange("video"),
                  className: "hidden",
                  id: "video-upload"
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "video-upload", className: "cursor-pointer text-center", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto h-8 w-8 text-gray-500 mb-2" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.video ? files.video.name : "Update Video" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Poster Image" }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => fetchTMDBPosters(1),
                  disabled: isLoadingPosters,
                  className: "w-full px-4 py-3 border-2 border-blue-600 bg-blue-600/10 text-blue-400 rounded-lg hover:bg-blue-600/20 transition-colors flex items-center justify-center gap-2",
                  children: isLoadingPosters ? /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
                    "Loading..."
                  ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(Upload, { className: "h-4 w-4" }),
                    "Select from TMDB"
                  ] })
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full px-4 py-3 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "file",
                    accept: "image/*",
                    onChange: handleFileChange("image"),
                    className: "hidden",
                    id: "image-upload"
                  }
                ),
                /* @__PURE__ */ jsx("label", { htmlFor: "image-upload", className: "cursor-pointer text-center w-full", children: /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.image ? files.image.name : "Or upload from computer" }) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Subtitles (Optional)" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".srt,.vtt",
                  onChange: handleFileChange("subtitles"),
                  className: "hidden",
                  id: "subtitles-upload"
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "subtitles-upload", className: "cursor-pointer text-center", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto h-8 w-8 text-gray-500 mb-2" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: files.subtitles ? files.subtitles.name : "Update Subtitles" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "title", className: "block text-sm font-medium text-gray-300", children: "Title" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                id: "title",
                value: formData.title,
                onChange: (e) => setFormData((prev) => ({ ...prev, title: e.target.value })),
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { htmlFor: "year", className: "block text-sm font-medium text-gray-300", children: "Year" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  id: "year",
                  value: formData.year,
                  onChange: (e) => setFormData((prev) => ({ ...prev, year: parseInt(e.target.value) })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { htmlFor: "director", className: "block text-sm font-medium text-gray-300", children: "Director" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  id: "director",
                  value: formData.director,
                  onChange: (e) => setFormData((prev) => ({ ...prev, director: e.target.value })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  required: true
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "genre", className: "block text-sm font-medium text-gray-300", children: "Genres (comma-separated)" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                id: "genre",
                value: formData.genre.join(", "),
                onChange: handleGenreChange,
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                placeholder: "Action, Drama, Thriller",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { htmlFor: "description", className: "block text-sm font-medium text-gray-300", children: "Description" }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                id: "description",
                value: formData.description,
                onChange: (e) => setFormData((prev) => ({ ...prev, description: e.target.value })),
                rows: 4,
                className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                required: true
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => setShowAdvanced(!showAdvanced),
              className: "flex items-center gap-2 text-gray-400 hover:text-white transition-colors",
              children: [
                /* @__PURE__ */ jsx(ChevronRight, { className: `w-4 h-4 transform transition-transform ${showAdvanced ? "rotate-90" : ""}` }),
                "Advanced Options"
              ]
            }
          ),
          showAdvanced && /* @__PURE__ */ jsxs("div", { className: "space-y-4 p-4 bg-gray-800/50 rounded-lg", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "R2 Image Path" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.r2_image_path,
                  onChange: (e) => setFormData((prev) => ({ ...prev, r2_image_path: e.target.value })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  placeholder: "images/image.jpg"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "R2 Video Path" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.r2_video_path,
                  onChange: (e) => setFormData((prev) => ({ ...prev, r2_video_path: e.target.value })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  placeholder: "movies/video.mp4"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "R2 Subtitles Path (Optional)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.r2_subtitles_path || "",
                  onChange: (e) => setFormData((prev) => ({ ...prev, r2_subtitles_path: e.target.value || null })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  placeholder: "subtitles/subtitles.vtt"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Streaming URL (Optional)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.streaming_url || "",
                  onChange: (e) => setFormData((prev) => ({ ...prev, streaming_url: e.target.value || null })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  placeholder: "https://example.com/stream"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-gray-300", children: "Cloudflare Video ID (Optional)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.cloudflare_video_id || "",
                  onChange: (e) => setFormData((prev) => ({ ...prev, cloudflare_video_id: e.target.value || null })),
                  className: "mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white",
                  placeholder: "cloudflare-video-id"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-yellow-500 bg-yellow-500/10 p-3 rounded-lg text-sm", children: [
              /* @__PURE__ */ jsx(TriangleAlert, { className: "h-4 w-4" }),
              /* @__PURE__ */ jsx("span", { children: "Editing these values directly can affect movie playback. Make sure you know what you're doing." })
            ] })
          ] })
        ] }),
        error && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg", children: [
          /* @__PURE__ */ jsx(CircleAlert, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsx("span", { children: error })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "px-4 py-2 text-gray-400 hover:text-white transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: isSubmitting,
              className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 \n                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              children: isSubmitting ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
                "Updating..."
              ] }) : "Update Movie"
            }
          )
        ] })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx(
      TMDBPosterSelector,
      {
        isOpen: showTMDBPosters,
        onClose: () => setShowTMDBPosters(false),
        posters: tmdbPosters,
        onSelect: downloadTMDBPoster,
        isLoading: isLoadingPosters,
        selectedPosterUrl,
        onLoadMore: loadMorePosters,
        hasMorePosters
      }
    ),
    /* @__PURE__ */ jsx("style", { jsx: true, children: `
        .webkit-scrollbar::-webkit-scrollbar {
          width: 12px;
        }

        .webkit-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.8);
          border-radius: 6px;
        }

        .webkit-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 1);
        }
      ` })
  ] });
};
const MovieCard = ({ movie, priority = false, onMovieClick }) => {
  const router = useRouter();
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [fullMovieData, setFullMovieData] = useState(null);
  const handleCardClick = (e) => {
    if (e.target.closest(".edit-button")) return;
    if (movie.id) {
      if (onMovieClick) {
        onMovieClick(movie.id);
      } else {
        router.push(`/movie/${movie.id}`);
      }
    }
  };
  const fetchFullMovieDetails = async () => {
    try {
      const response = await fetch(`/api/movies/${movie.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch movie details");
      }
      const data = await response.json();
      setFullMovieData(data);
      setShowEditForm(true);
    } catch (error) {
      console.error("Error fetching movie details:", error);
    }
  };
  const imageUrl = movie.r2_image_path ? `/api/movie/${movie.r2_image_path}?format=webp` : null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "cursor-pointer group relative", onClick: handleCardClick, children: [
      user?.isAdmin && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            fetchFullMovieDetails();
          },
          className: "edit-button absolute top-2 right-2 p-2 bg-black/50 rounded-full \n                      opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all\n                      backdrop-blur-sm z-10",
          title: "Edit movie",
          children: /* @__PURE__ */ jsx(Pencil, { className: "w-4 h-4 text-white" })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "relative aspect-[27/40] overflow-hidden rounded-lg bg-gray-900", children: imageUrl && !imageError ? /* @__PURE__ */ jsx(
        Image,
        {
          src: imageUrl,
          alt: movie.title,
          fill: true,
          quality: 70,
          className: "object-cover transition-transform group-hover:scale-105",
          onError: () => {
            console.error(`Failed to load image for ${movie.title}`);
            setImageError(true);
          }
        }
      ) : /* @__PURE__ */ jsx("div", { className: "w-full h-full flex items-center justify-center bg-gray-800", children: /* @__PURE__ */ jsx("span", { className: "text-gray-500", children: "No image" }) }) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-2", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-gray-100 font-medium line-clamp-1", children: movie.title }),
        movie.year && /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-400", children: movie.year }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center mt-1", children: [
          /* @__PURE__ */ jsx(Star, { className: "w-4 h-4 text-yellow-400 fill-yellow-400 mr-1" }),
          /* @__PURE__ */ jsx("span", { className: "text-yellow-400 font-medium", children: movie.averageRating ? movie.averageRating.toFixed(1) : movie.rating.toFixed(1) }),
          /* @__PURE__ */ jsx("span", { className: "text-gray-500 text-sm ml-1", children: "/10" }),
          movie._count && /* @__PURE__ */ jsxs("span", { className: "text-gray-500 text-xs ml-2", children: [
            "(",
            movie._count.ratings,
            " ",
            movie._count.ratings === 1 ? "rating" : "ratings",
            ")"
          ] })
        ] })
      ] })
    ] }),
    showEditForm && fullMovieData && /* @__PURE__ */ jsx(
      EditMovieForm,
      {
        isOpen: showEditForm,
        onClose: () => setShowEditForm(false),
        movie: fullMovieData
      }
    )
  ] });
};
const MovieGrid = ({
  selectedGenre,
  sortOption,
  searchQuery = "",
  onMovieClick
}) => {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef(null);
  const observerRef = useRef(null);
  const fetchMovies = async (pageNum, append = true) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "42",
        // Divisible by 6 and 7 for clean grid layouts
        sort: sortOption
      });
      if (selectedGenre) {
        params.append("genre", selectedGenre);
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }
      const response = await fetch(`/api/movies?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch movies");
      const data = await response.json();
      setMovies((prev) => append ? [...prev, ...data.movies] : data.movies);
      setHasMore(pageNum < data.pagination.pages);
    } catch (err) {
      setError("Error loading movies. Please try again.");
      console.error("Error fetching movies:", err);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    setMovies([]);
    setPage(1);
    setHasMore(true);
    fetchMovies(1, false);
  }, [selectedGenre, sortOption, searchQuery]);
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchMovies(nextPage, true);
        }
      },
      {
        rootMargin: "200px",
        // Start loading 200px before reaching the trigger
        threshold: 0.1
      }
    );
    observer.observe(loadMoreRef.current);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, page]);
  if (error) {
    return /* @__PURE__ */ jsxs("div", { className: "text-center py-12", children: [
      /* @__PURE__ */ jsx("div", { className: "text-red-500 mb-4", children: error }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => fetchMovies(1, false),
          className: "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors",
          children: "Try Again"
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-3 md:gap-5", children: movies.map((movie) => /* @__PURE__ */ jsx(
      MovieCard,
      {
        movie,
        onMovieClick
      },
      movie.id
    )) }),
    isLoading && /* @__PURE__ */ jsx("div", { className: "flex justify-center py-8", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-blue-500" }) }),
    hasMore && !isLoading && /* @__PURE__ */ jsx("div", { ref: loadMoreRef, className: "h-20" }),
    !hasMore && movies.length > 0 && /* @__PURE__ */ jsx("div", { className: "text-center text-gray-400 text-sm py-8", children: "All movies loaded" })
  ] });
};
const RatingStars = ({
  movieId,
  initialRating = 0,
  onRatingChange,
  size = "default",
  isEditable = true
}) => {
  const [rating, setRating] = useState(0);
  const [userRating, setUserRating] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverRating, setHoverRating] = useState(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef(null);
  const { user } = useAuth();
  const canEdit = isEditable && user && !user.isAdmin;
  useEffect(() => {
    setRating(initialRating || 0);
  }, [initialRating]);
  useEffect(() => {
    if (isEditable && user) {
      fetchUserRating();
    }
  }, [movieId, isEditable, user]);
  const fetchUserRating = async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.rating !== null) {
          setUserRating(data.rating);
          setRating(data.rating);
        } else {
          setRating(initialRating);
        }
      }
    } catch (err) {
      console.error("Error fetching user rating:", err);
      setRating(initialRating);
    }
  };
  const handleRatingChange = async (newRating) => {
    if (!canEdit) {
      if (!user) {
        setError("Please log in to rate movies");
      }
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ value: newRating })
      });
      if (!response.ok) {
        throw new Error("Failed to update rating");
      }
      setUserRating(newRating);
      setRating(newRating);
      const data = await response.json();
      if (data.averageRating) {
      }
      if (onRatingChange) {
        onRatingChange(newRating);
      }
    } catch (err) {
      setError("Failed to update rating");
      console.error("Rating error:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const calculateRating = (index, clientX, target) => {
    const { left, width } = target.getBoundingClientRect();
    const offsetX = clientX - left;
    const fraction = offsetX / width;
    return index + (fraction > 0.5 ? 1 : 0.5);
  };
  const handleClearRating = async () => {
    if (!canEdit || isLoading) return;
    setIsLoading(true);
    setShowContextMenu(false);
    setError(null);
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (!response.ok) throw new Error("Failed to clear rating");
      setUserRating(null);
      setRating(0);
      if (onRatingChange) {
        onRatingChange(0);
      }
    } catch (err) {
      setError("Failed to clear rating");
      console.error("Clear rating error:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleContextMenu = (e) => {
    if (!canEdit) return;
    const currentRating = userRating || rating;
    if (!currentRating || currentRating === 0) return;
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setShowContextMenu(false);
      }
    };
    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showContextMenu]);
  const displayRating = hoverRating !== null ? hoverRating : rating;
  const starSize = size === "inline" ? "w-5 h-5" : "w-6 h-6";
  const gapSize = size === "inline" ? "gap-0.5" : "gap-1";
  const marginSize = size === "inline" ? "ml-1" : "ml-2";
  return /* @__PURE__ */ jsxs("div", { className: `flex items-center ${size === "inline" ? "gap-0" : "gap-2"} relative`, children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `flex ${gapSize}`,
        onMouseLeave: () => canEdit && setHoverRating(null),
        onContextMenu: handleContextMenu,
        children: Array.from({ length: 10 }).map((_, i) => {
          const isFilled = displayRating >= i + 1;
          const isHalfFilled = displayRating >= i + 0.5 && displayRating < i + 1;
          return /* @__PURE__ */ jsx(
            "button",
            {
              onClick: (e) => {
                if (!canEdit) return;
                const newRating = calculateRating(i, e.clientX, e.currentTarget);
                handleRatingChange(newRating);
              },
              onMouseMove: (e) => {
                if (canEdit) {
                  const hoverValue = calculateRating(i, e.clientX, e.currentTarget);
                  setHoverRating(hoverValue);
                }
              },
              className: `focus:outline-none ${canEdit ? "cursor-pointer" : "cursor-default"} ${isLoading ? "opacity-50" : ""}`,
              disabled: !canEdit || isLoading,
              title: !isEditable ? "" : !user ? "Please log in to rate movies" : user.isAdmin ? "Admins cannot rate movies" : `Rate ${i + 1}`,
              children: /* @__PURE__ */ jsx(
                Star,
                {
                  className: `${starSize} ${isFilled ? "text-yellow-400 fill-yellow-400" : isHalfFilled ? "text-yellow-400" : "text-gray-600"} ${canEdit && !isLoading ? "hover:text-yellow-400" : ""} transition-colors`
                }
              )
            },
            i
          );
        })
      }
    ),
    size === "default" && isLoading ? /* @__PURE__ */ jsx(LoaderCircle, { className: "w-4 h-4 ml-2 animate-spin text-blue-500" }) : displayRating > 0 ? /* @__PURE__ */ jsx("span", { className: `${marginSize} ${size === "inline" ? "text-sm text-gray-400" : "text-gray-300"} font-medium ${size === "inline" ? "min-w-[2rem]" : ""}`, children: userRating && isEditable ? /* @__PURE__ */ jsx("span", { className: "text-yellow-400", children: displayRating.toFixed(1) }) : displayRating.toFixed(1) }) : null,
    size === "default" && error && /* @__PURE__ */ jsx("span", { className: "ml-2 text-sm text-red-500", children: error }),
    showContextMenu && /* @__PURE__ */ jsx(
      "div",
      {
        ref: contextMenuRef,
        className: "fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]",
        style: {
          left: `${contextMenuPos.x}px`,
          top: `${contextMenuPos.y}px`
        },
        children: /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleClearRating,
            className: "w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors flex items-center gap-2",
            disabled: isLoading,
            children: [
              /* @__PURE__ */ jsx(X, { className: "w-4 h-4" }),
              "Clear Rating"
            ]
          }
        )
      }
    )
  ] });
};
const SmallRatingStars = ({ rating }) => {
  return /* @__PURE__ */ jsx("div", { className: "flex gap-0.5", children: Array.from({ length: 10 }).map((_, i) => {
    const fillPercentage = Math.max(0, Math.min(1, rating - i));
    const isFilled = fillPercentage >= 1;
    const isHalfFilled = fillPercentage >= 0.5 && fillPercentage < 1;
    return /* @__PURE__ */ jsx(
      Star,
      {
        className: `w-4 h-4 ${isFilled ? "text-yellow-400 fill-yellow-400" : isHalfFilled ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}`,
        style: isHalfFilled ? {
          clipPath: "inset(0 50% 0 0)"
        } : void 0
      },
      i
    );
  }) });
};
const Reviews = ({ ratings, reviews }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = /* @__PURE__ */ new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1e3 * 60 * 60 * 24));
    if (diffInDays === 0) {
      return "Today";
    } else if (diffInDays === 1) {
      return "Yesterday";
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} ${months === 1 ? "month" : "months"} ago`;
    } else {
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
  };
  const reviewsByUserId = new Map(
    reviews.map((review) => [review.user.id, review])
  );
  const combinedData = ratings.map((rating) => ({
    id: rating.id,
    userId: rating.user.id,
    username: rating.user.username,
    rating: rating.value,
    created_at: rating.created_at,
    review_text: reviewsByUserId.get(rating.user.id)?.review_text || null
  }));
  if (combinedData.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "text-gray-400 text-sm text-center py-4", children: "No ratings yet. Be the first to rate this movie!" });
  }
  return /* @__PURE__ */ jsx("div", { className: "space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar", children: combinedData.map((item) => /* @__PURE__ */ jsxs(
    "div",
    {
      className: "bg-gray-800/50 rounded-lg p-4 border border-gray-700/50",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between mb-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-white text-sm", children: item.username }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(SmallRatingStars, { rating: item.rating }),
              /* @__PURE__ */ jsx("span", { className: "text-yellow-400 text-sm font-medium", children: item.rating.toFixed(1) })
            ] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "text-gray-400 text-xs", children: formatDate(item.created_at) })
        ] }),
        item.review_text && /* @__PURE__ */ jsx("p", { className: "text-gray-300 text-sm leading-relaxed mt-2", children: item.review_text })
      ]
    },
    item.id
  )) });
};
const MovieDetailsModal = ({
  movieId,
  isOpen,
  onClose,
  onWatchNow
}) => {
  const [movie, setMovie] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [userRating, setUserRating] = useState(null);
  const [showReviews, setShowReviews] = useState(false);
  const { user } = useAuth();
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };
  const fetchMovieDetails = async () => {
    if (!movieId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/movies/${movieId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch movie details");
      }
      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError("Error loading movie details. Please try again.");
      console.error("Error fetching movie details:", err);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    if (isOpen && movieId) {
      fetchMovieDetails();
      fetchUserReview();
    }
  }, [isOpen, movieId]);
  const fetchUserReview = async () => {
    if (!user || !movieId) return;
    try {
      const [reviewResponse, ratingResponse] = await Promise.all([
        fetch(`/api/movies/${movieId}/review`, {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          }
        }),
        fetch(`/api/movies/${movieId}/rate`, {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          }
        })
      ]);
      if (reviewResponse.ok) {
        const data = await reviewResponse.json();
        if (data.review) {
          setReviewText(data.reviewText || "");
        }
      }
      if (ratingResponse.ok) {
        const data = await ratingResponse.json();
        setUserRating(data.rating);
      }
    } catch (err) {
      console.error("Error fetching user review:", err);
    }
  };
  const handleSubmitReview = async () => {
    if (!user) {
      setReviewError("Please log in to submit a review");
      return;
    }
    if (!userRating || userRating === 0) {
      setReviewError("Please rate the movie before submitting a review");
      return;
    }
    setIsSubmittingReview(true);
    setReviewError(null);
    try {
      const response = await fetch(`/api/movies/${movieId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          reviewText: reviewText.trim(),
          rating: userRating
        })
      });
      if (!response.ok) {
        throw new Error("Failed to submit review");
      }
      await fetchMovieDetails();
      setReviewError(null);
    } catch (err) {
      setReviewError("Failed to submit review. Please try again.");
      console.error("Error submitting review:", err);
    } finally {
      setIsSubmittingReview(false);
    }
  };
  const handleRatingChange = async (newRating) => {
    if (!user || !movieId) return;
    try {
      const response = await fetch(`/api/movies/${movieId}/rate`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUserRating(data.rating);
      }
    } catch (err) {
      console.error("Error fetching updated rating:", err);
    }
  };
  const handleWatchClick = () => {
    if (user?.isGuest) {
      return;
    }
    window.location.href = `/movie/${movieId}`;
  };
  const getOptimizedImageUrl = (path) => {
    return `/api/movie/${path}?format=webp`;
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4", children: /* @__PURE__ */ jsxs("div", { className: "relative w-[70vw] max-w-6xl h-[56vh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: onClose,
        className: "absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors",
        children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5 text-white" })
      }
    ),
    isLoading ? /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsx("div", { className: "text-white", children: "Loading..." }) }) : error ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full", children: [
      /* @__PURE__ */ jsx("div", { className: "text-red-400 mb-4", children: error }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: fetchMovieDetails,
          className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors",
          children: "Try Again"
        }
      )
    ] }) : movie ? /* @__PURE__ */ jsxs("div", { className: "flex h-full overflow-hidden p-6 gap-6", children: [
      /* @__PURE__ */ jsx("div", { className: "flex-shrink-0 flex flex-col", children: /* @__PURE__ */ jsx("div", { className: "relative aspect-[27/40] w-80 overflow-hidden rounded-lg bg-gray-800", children: movie.r2_image_path && !imageError ? /* @__PURE__ */ jsx(
        Image,
        {
          src: getOptimizedImageUrl(movie.r2_image_path),
          alt: movie.title,
          fill: true,
          quality: 85,
          className: "object-cover",
          onError: () => setImageError(true)
        }
      ) : /* @__PURE__ */ jsx("div", { className: "w-full h-full bg-gray-700 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "text-gray-400 text-sm", children: "No Image" }) }) }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col overflow-hidden justify-between min-h-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-3xl font-bold text-white mb-2", children: movie.title }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 text-gray-300 mb-4", children: [
            movie.year && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Calendar, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsx("span", { children: movie.year })
            ] }),
            movie.duration && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Clock, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsx("span", { children: formatDuration(movie.duration) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Star, { className: "w-4 h-4 fill-yellow-400 text-yellow-400" }),
              /* @__PURE__ */ jsx("span", { children: movie.averageRating ? movie.averageRating.toFixed(1) : "N/A" }),
              /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                "(",
                movie._count.ratings,
                " ratings)"
              ] })
            ] })
          ] }),
          movie.description && /* @__PURE__ */ jsx("div", { className: "mb-4", children: /* @__PURE__ */ jsx(
            "p",
            {
              className: "text-gray-300 text-sm leading-relaxed overflow-hidden",
              style: {
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical"
              },
              children: movie.description
            }
          ) }),
          movie.genre && movie.genre.length > 0 && /* @__PURE__ */ jsx("div", { className: "mb-4", children: /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: movie.genre.map((genre, index) => /* @__PURE__ */ jsx(
            "span",
            {
              className: "inline-block px-3 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30",
              children: genre.trim()
            },
            index
          )) }) }),
          /* @__PURE__ */ jsx("div", { className: "overflow-hidden max-h-[280px]", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: "transition-transform duration-500 ease-in-out",
              style: { transform: showReviews ? "translateX(-100%)" : "translateX(0)" },
              children: /* @__PURE__ */ jsxs("div", { className: "flex w-[200%]", children: [
                /* @__PURE__ */ jsxs("div", { className: "w-1/2 pr-4 overflow-y-auto custom-scrollbar", children: [
                  /* @__PURE__ */ jsx("div", { className: "mb-4", children: /* @__PURE__ */ jsx(
                    RatingStars,
                    {
                      movieId: movie.id,
                      initialRating: movie.averageRating,
                      onRatingChange: handleRatingChange
                    }
                  ) }),
                  /* @__PURE__ */ jsx("div", { className: "mb-4", children: user && !user.isAdmin ? /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(
                      "textarea",
                      {
                        value: reviewText,
                        onChange: (e) => setReviewText(e.target.value),
                        placeholder: "Share your thoughts about this movie...",
                        className: "w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-gray-300 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none",
                        rows: 3
                      }
                    ),
                    reviewError && /* @__PURE__ */ jsx("p", { className: "text-red-400 text-xs mt-1", children: reviewError }),
                    /* @__PURE__ */ jsxs("div", { className: "flex gap-2 mt-2", children: [
                      /* @__PURE__ */ jsx(
                        "button",
                        {
                          onClick: handleSubmitReview,
                          disabled: isSubmittingReview || !reviewText.trim(),
                          className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors",
                          children: isSubmittingReview ? "Submitting..." : "Submit Review"
                        }
                      ),
                      /* @__PURE__ */ jsxs(
                        "button",
                        {
                          onClick: () => setShowReviews(true),
                          className: "px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2",
                          children: [
                            /* @__PURE__ */ jsx(MessageSquare, { className: "w-4 h-4" }),
                            "See Reviews (",
                            movie._count.ratings,
                            ")"
                          ]
                        }
                      )
                    ] })
                  ] }) : /* @__PURE__ */ jsxs(
                    "button",
                    {
                      onClick: () => setShowReviews(true),
                      className: "w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                      children: [
                        /* @__PURE__ */ jsx(MessageSquare, { className: "w-4 h-4" }),
                        "See Reviews (",
                        movie._count.ratings,
                        ")"
                      ]
                    }
                  ) })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "w-1/2 pl-4 overflow-y-auto custom-scrollbar", children: [
                  /* @__PURE__ */ jsx("div", { className: "mb-3 flex align-left", children: /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => setShowReviews(false),
                      className: "text-sm text-blue-400 hover:text-blue-300 transition-colors",
                      children: "← Back"
                    }
                  ) }),
                  /* @__PURE__ */ jsx(Reviews, { ratings: movie.ratings, reviews: movie.reviews })
                ] })
              ] })
            }
          ) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-shrink-0 pt-3 border-t border-gray-600", children: /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleWatchClick,
            className: "flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors",
            children: [
              /* @__PURE__ */ jsx(Play, { className: "w-5 h-5" }),
              "Watch Now"
            ]
          }
        ) })
      ] })
    ] }) : null
  ] }) });
};
function HomeContent() {
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get("genre"));
  const [sortOption, setSortOption] = useState(searchParams.get("sort") || "title-asc");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  if (isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-gray-400" }) });
  }
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);
  if (!user) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-gray-400" }) });
  }
  useEffect(() => {
    setIsInitialized(true);
  }, []);
  useEffect(() => {
    if (!isInitialized) return;
    const params = new URLSearchParams();
    if (selectedGenre) {
      params.set("genre", selectedGenre);
    }
    if (sortOption !== "title-asc") {
      params.set("sort", sortOption);
    }
    if (searchQuery.trim()) {
      params.set("query", searchQuery.trim());
    }
    const queryString = params.toString();
    const newUrl = queryString ? `/?${queryString}` : "/";
    if (window.location.pathname + window.location.search !== newUrl) {
      router.push(newUrl, { scroll: false });
    }
  }, [selectedGenre, sortOption, searchQuery, isInitialized, router]);
  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
  };
  const handleSortChange = (option) => {
    setSortOption(option);
  };
  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };
  const handleMovieClick = (movieId) => {
    setSelectedMovieId(movieId);
  };
  const handleCloseModal = () => {
    setSelectedMovieId(null);
  };
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx(
      MovieGridHeader,
      {
        onGenreSelect: handleGenreSelect,
        onSortChange: handleSortChange,
        selectedGenre,
        selectedSort: sortOption,
        searchQuery,
        onSearchChange: handleSearchChange
      }
    ),
    /* @__PURE__ */ jsx("main", { className: "px-16", children: /* @__PURE__ */ jsx("div", { className: "max-w-[128rem] mx-auto pt-8 pb-16", children: /* @__PURE__ */ jsx(
      MovieGrid,
      {
        selectedGenre,
        sortOption,
        searchQuery,
        onMovieClick: handleMovieClick
      }
    ) }) }),
    selectedMovieId && /* @__PURE__ */ jsx(
      MovieDetailsModal,
      {
        movieId: selectedMovieId,
        isOpen: !!selectedMovieId,
        onClose: handleCloseModal,
        onWatchNow: () => {
        }
      }
    )
  ] });
}
function Home() {
  return /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-gray-400" }) }), children: /* @__PURE__ */ jsx(HomeContent, {}) });
}
function PublicHome() {
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [sortOption, setSortOption] = useState("title-asc");
  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
  };
  const handleSortChange = (option) => {
    setSortOption(option);
  };
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx(
      MovieGridHeader,
      {
        onGenreSelect: handleGenreSelect,
        onSortChange: handleSortChange,
        selectedGenre,
        selectedSort: sortOption
      }
    ),
    /* @__PURE__ */ jsx("main", { className: "px-16", children: /* @__PURE__ */ jsx("div", { className: "max-w-[128rem] mx-auto pt-8 pb-16", children: /* @__PURE__ */ jsx(
      MovieGrid,
      {
        selectedGenre,
        sortOption
      }
    ) }) })
  ] });
}
function RatingsContent() {
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [movies, setMovies] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(() => {
    const usersParam = searchParams.get("users");
    return usersParam ? usersParam.split(",") : [];
  });
  const [sortColumn, setSortColumn] = useState(searchParams.get("sortBy") || "title");
  const [sortDirection, setSortDirection] = useState(
    searchParams.get("sortDir") || "asc"
  );
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);
  useEffect(() => {
    setIsInitialized(true);
  }, []);
  useEffect(() => {
    if (!isInitialized) return;
    const params = new URLSearchParams();
    if (selectedUserIds.length > 0) {
      params.set("users", selectedUserIds.join(","));
    }
    if (sortColumn !== "title") {
      params.set("sortBy", sortColumn);
    }
    if (sortDirection !== "asc") {
      params.set("sortDir", sortDirection);
    }
    const queryString = params.toString();
    const newUrl = queryString ? `/ratings?${queryString}` : "/ratings";
    if (window.location.pathname + window.location.search !== newUrl) {
      router.push(newUrl, { scroll: false });
    }
  }, [selectedUserIds, sortColumn, sortDirection, isInitialized, router]);
  useEffect(() => {
    if (user) {
      fetchRatings();
    }
  }, [user, selectedUserIds]);
  const fetchRatings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ userIds: selectedUserIds })
      });
      if (!response.ok) throw new Error("Failed to fetch ratings");
      const data = await response.json();
      setMovies(data.movies);
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
    } catch (err) {
      setError("Error loading ratings. Please try again.");
      console.error("Error fetching ratings:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const searchUsers = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (!response.ok) throw new Error("Failed to search users");
      const data = await response.json();
      const filteredResults = data.users.filter(
        (u) => !users.some((existing) => existing.id === u.id)
      );
      setSearchResults(filteredResults);
    } catch (err) {
      console.error("Error searching users:", err);
    } finally {
      setIsSearching(false);
    }
  };
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);
  const addUser = (userId) => {
    if (!selectedUserIds.includes(userId)) {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowUserSearch(false);
  };
  const removeUser = (userId) => {
    setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
  };
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection(column === "title" ? "asc" : "desc");
    }
  };
  const getSortedMovies = () => {
    const sorted = [...movies];
    sorted.sort((a, b) => {
      let aValue;
      let bValue;
      if (sortColumn === "title") {
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
      } else if (sortColumn === "average") {
        aValue = a.averageRating || 0;
        bValue = b.averageRating || 0;
      } else {
        const aRating = a.ratings.find((r) => r.user_id === sortColumn);
        const bRating = b.ratings.find((r) => r.user_id === sortColumn);
        aValue = aRating?.value || 0;
        bValue = bRating?.value || 0;
      }
      if (sortDirection === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    return sorted;
  };
  const getRatingForUser = (movie, userId) => {
    const rating = movie.ratings.find((r) => r.user_id === userId);
    return rating ? rating.value : null;
  };
  const calculateAverageForMovie = (movie) => {
    const userRatings = users.map((u) => getRatingForUser(movie, u.id)).filter((r) => r !== null);
    if (userRatings.length === 0) return null;
    const sum = userRatings.reduce((acc, val) => acc + val, 0);
    return sum / userRatings.length;
  };
  const handleRatingChange = (movieId, userId, newRating) => {
    setMovies(
      (prevMovies) => prevMovies.map((movie) => {
        if (movie.id !== movieId) return movie;
        const existingRatingIndex = movie.ratings.findIndex((r) => r.user_id === userId);
        let updatedRatings = [...movie.ratings];
        if (newRating === 0) {
          updatedRatings = updatedRatings.filter((r) => r.user_id !== userId);
        } else if (existingRatingIndex >= 0) {
          updatedRatings[existingRatingIndex] = {
            ...updatedRatings[existingRatingIndex],
            value: newRating
          };
        } else {
          const user2 = users.find((u) => u.id === userId);
          if (user2) {
            updatedRatings.push({
              value: newRating,
              user_id: userId,
              user: {
                id: userId,
                username: user2.username
              }
            });
          }
        }
        const userRatingsForAvg = users.map((u) => {
          const rating = updatedRatings.find((r) => r.user_id === u.id);
          return rating ? rating.value : null;
        }).filter((r) => r !== null);
        const newAverageRating = userRatingsForAvg.length > 0 ? userRatingsForAvg.reduce((acc, val) => acc + val, 0) / userRatingsForAvg.length : null;
        return {
          ...movie,
          ratings: updatedRatings,
          averageRating: newAverageRating
        };
      })
    );
  };
  if (authLoading || isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-gray-400" }) });
  }
  if (!user) return null;
  const sortedMovies = getSortedMovies();
  const displayUsers = users.sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return a.username.localeCompare(b.username);
  });
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsxs("main", { className: "px-8 py-8 max-w-[120rem] mx-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-6 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold text-white", children: "Ratings" }),
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setShowUserSearch(!showUserSearch),
              className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors",
              children: [
                /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4" }),
                "Add User"
              ]
            }
          ),
          showUserSearch && /* @__PURE__ */ jsxs("div", { className: "absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 border-b border-gray-700", children: /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: searchQuery,
                  onChange: (e) => setSearchQuery(e.target.value),
                  placeholder: "Search users...",
                  className: "w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
                  autoFocus: true
                }
              )
            ] }) }),
            /* @__PURE__ */ jsx("div", { className: "max-h-60 overflow-y-auto custom-scrollbar", children: isSearching ? /* @__PURE__ */ jsx("div", { className: "p-4 text-center text-gray-400", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-5 h-5 animate-spin mx-auto" }) }) : searchResults.length > 0 ? searchResults.map((searchUser) => /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => addUser(searchUser.id),
                className: "w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors text-white text-sm",
                children: searchUser.username
              },
              searchUser.id
            )) : searchQuery.length >= 2 ? /* @__PURE__ */ jsx("div", { className: "p-4 text-center text-gray-400 text-sm", children: "No users found" }) : /* @__PURE__ */ jsx("div", { className: "p-4 text-center text-gray-400 text-sm", children: "Type at least 2 characters to search" }) })
          ] })
        ] })
      ] }),
      error ? /* @__PURE__ */ jsxs("div", { className: "text-center py-12", children: [
        /* @__PURE__ */ jsx("div", { className: "text-red-500 mb-4", children: error }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: fetchRatings,
            className: "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors",
            children: "Try Again"
          }
        )
      ] }) : /* @__PURE__ */ jsxs("div", { className: "bg-gray-800 rounded-lg border border-gray-700 overflow-hidden", children: [
        /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full", children: [
          /* @__PURE__ */ jsx("thead", { className: "bg-gray-900 border-b border-gray-700", children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx(
              "th",
              {
                className: "px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors",
                onClick: () => handleSort("title"),
                children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  "Movie",
                  sortColumn === "title" && (sortDirection === "asc" ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4" }))
                ] })
              }
            ),
            displayUsers.map((u) => /* @__PURE__ */ jsx(
              "th",
              {
                className: "px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors group",
                onClick: () => handleSort(u.id),
                children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    u.username,
                    u.id === currentUserId && /* @__PURE__ */ jsx("span", { className: "text-xs text-blue-400", children: "(You)" }),
                    sortColumn === u.id && (sortDirection === "asc" ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4" }))
                  ] }),
                  u.id !== currentUserId && /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: (e) => {
                        e.stopPropagation();
                        removeUser(u.id);
                      },
                      className: "opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all",
                      title: "Remove user",
                      children: /* @__PURE__ */ jsx(X, { className: "w-3 h-3" })
                    }
                  )
                ] })
              },
              u.id
            )),
            /* @__PURE__ */ jsx(
              "th",
              {
                className: "px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors",
                onClick: () => handleSort("average"),
                children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  "Average",
                  sortColumn === "average" && (sortDirection === "asc" ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-4 h-4" }))
                ] })
              }
            )
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: sortedMovies.map((movie, index) => /* @__PURE__ */ jsxs(
            "tr",
            {
              className: `border-b border-gray-700 hover:bg-gray-750 transition-colors ${index % 2 === 0 ? "bg-gray-800/50" : "bg-gray-800/30"}`,
              children: [
                /* @__PURE__ */ jsx("td", { className: "px-6 py-4", children: /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("div", { className: "text-white font-medium", children: movie.title }),
                  /* @__PURE__ */ jsx("div", { className: "text-gray-400 text-sm", children: movie.year })
                ] }) }),
                displayUsers.map((u) => /* @__PURE__ */ jsx("td", { className: "px-6 py-4", children: /* @__PURE__ */ jsx(
                  RatingStars,
                  {
                    movieId: movie.id,
                    initialRating: getRatingForUser(movie, u.id) || 0,
                    isEditable: u.id === currentUserId,
                    size: "inline",
                    onRatingChange: (newRating) => handleRatingChange(movie.id, u.id, newRating || 0)
                  }
                ) }, u.id)),
                /* @__PURE__ */ jsx("td", { className: "px-6 py-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx("div", { className: "flex gap-0.5", children: Array.from({ length: 10 }).map((_, i) => {
                    const avg = calculateAverageForMovie(movie) || 0;
                    const isFilled = avg >= i + 1;
                    const isHalfFilled = avg >= i + 0.5 && avg < i + 1;
                    return /* @__PURE__ */ jsx("div", { className: "w-4 h-4 flex items-center justify-center", children: /* @__PURE__ */ jsx("div", { className: `w-3 h-3 ${isFilled ? "bg-yellow-400" : isHalfFilled ? "bg-yellow-400/50" : "bg-gray-600"} rounded-sm` }) }, i);
                  }) }),
                  calculateAverageForMovie(movie) !== null && /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-400 font-medium", children: calculateAverageForMovie(movie)?.toFixed(1) })
                ] }) })
              ]
            },
            movie.id
          )) })
        ] }) }),
        sortedMovies.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-12 text-gray-400", children: "No movies found" })
      ] })
    ] })
  ] });
}
function RatingsPage() {
  return /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center", children: /* @__PURE__ */ jsx(LoaderCircle, { className: "w-8 h-8 animate-spin text-gray-400" }) }), children: /* @__PURE__ */ jsx(RatingsContent, {}) });
}
function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, updatePassword } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!user || !user.mustResetPassword) {
      router.push("/");
    }
  }, [user, router]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(password);
      router.push("/");
    } catch (err) {
      setError("Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };
  if (!user?.mustResetPassword) return null;
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full space-y-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-3xl font-bold text-white", children: "Reset Password" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-gray-400", children: "Please set a new password to continue" })
    ] }),
    /* @__PURE__ */ jsxs("form", { className: "mt-8 space-y-6", onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-md shadow-sm space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "password",
              required: true,
              value: password,
              onChange: (e) => setPassword(e.target.value),
              className: "appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50\n                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              placeholder: "New password",
              minLength: 8
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "password",
              required: true,
              value: confirmPassword,
              onChange: (e) => setConfirmPassword(e.target.value),
              className: "appearance-none relative block w-full pl-12 pr-3 py-3 bg-gray-800/50\n                         border border-gray-700 placeholder-gray-500 text-gray-100 rounded-lg\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              placeholder: "Confirm new password",
              minLength: 8
            }
          )
        ] })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg", children: error }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "submit",
          disabled: isLoading,
          className: "group relative w-full flex justify-center py-3 px-4 border border-transparent\n                     text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700\n                     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500\n                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          children: isLoading ? "Updating..." : "Set New Password"
        }
      )
    ] })
  ] }) });
}
const export_f29e6e234fea = {
  ErrorBoundary,
  NotFoundBoundary
};
const export_0deffcb8ffd7 = {
  LayoutSegmentProvider
};
const export_31585754d24e = {
  default: LoginPage
};
const export_a51bfb13d020 = {
  default: MoviePage
};
const export_73d7a23e5015 = {
  default: Home
};
const export_104784aef6c0 = {
  default: PublicHome
};
const export_3264f6c18f35 = {
  default: RatingsPage
};
const export_8429a7681a9c = {
  default: ResetPasswordPage
};
const export_18818acbefb3 = {
  AuthProvider
};
export {
  export_0deffcb8ffd7,
  export_104784aef6c0,
  export_18818acbefb3,
  export_31585754d24e,
  export_3264f6c18f35,
  export_73d7a23e5015,
  export_8429a7681a9c,
  export_a51bfb13d020,
  export_f29e6e234fea
};
